import type { Event } from "../../../../packages/shared/src/domain/events";
import { validateEvent } from "../../../../packages/shared/src/domain/validation";

type RawQueryExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <TRow>(query: string, ...values: unknown[]) => Promise<TRow[]>;
};

type StoredEventRow = {
  event_id: string;
  event_type: string;
  occurred_at: Date;
  recorded_at: Date;
  actor_user_id: string;
  device_id: string;
  location_text: string | null;
  schema_version: number;
  correlation_id: string | null;
  causation_id: string | null;
  payload: unknown;
};

type CursorParts = {
  recordedAt: string;
  eventId: string;
};

type AppendStatus = "accepted" | "duplicate" | "rejected";

export type AppendEventResult = {
  status: AppendStatus;
  reason?: string;
};

export type ProjectionFreshnessRecord = {
  refreshedAt: string | null;
  cursor: string | null;
};

const encodeCursor = (parts: CursorParts): string =>
  Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");

const decodeCursor = (cursor: string): CursorParts | null => {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const recordedAt = parsed["recordedAt"];
    const eventId = parsed["eventId"];
    if (typeof recordedAt !== "string" || typeof eventId !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(recordedAt))) {
      return null;
    }
    return {
      recordedAt,
      eventId,
    };
  } catch {
    return null;
  }
};

const mapStoredEvent = (row: StoredEventRow): Event =>
  ({
    eventId: row.event_id,
    eventType: row.event_type as Event["eventType"],
    occurredAt: row.occurred_at.toISOString(),
    recordedAt: row.recorded_at.toISOString(),
    actorUserId: row.actor_user_id,
    deviceId: row.device_id,
    locationText: row.location_text,
    schemaVersion: row.schema_version as 1,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    payload: row.payload as Event["payload"],
  }) as Event;

export const createEventStore = (executor: RawQueryExecutor) => {
  const appendEvent = async (event: Event): Promise<AppendEventResult> => {
    const validation = validateEvent(event);
    if (!validation.ok) {
      const firstIssue = validation.issues[0];
      return {
        status: "rejected",
        reason: firstIssue?.message ?? "Invalid event payload",
      };
    }

    const payloadJson = JSON.stringify(event.payload);
    const insertedRows = await executor.$executeRawUnsafe(
      `
        insert into event (
          event_id,
          event_type,
          occurred_at,
          actor_user_id,
          device_id,
          location_text,
          schema_version,
          correlation_id,
          causation_id,
          payload
        ) values (
          $1::uuid,
          $2::event_type,
          $3::timestamptz,
          $4::uuid,
          $5::text,
          $6::text,
          $7::integer,
          $8::text,
          $9::text,
          $10::jsonb
        )
        on conflict (event_id) do nothing
      `,
      event.eventId,
      event.eventType,
      event.occurredAt,
      event.actorUserId,
      event.deviceId,
      event.locationText ?? null,
      event.schemaVersion,
      event.correlationId ?? null,
      event.causationId ?? null,
      payloadJson,
    );

    if (insertedRows === 0) {
      return {
        status: "duplicate",
      };
    }
    return {
      status: "accepted",
    };
  };

  const getLatestCursor = async (): Promise<string | null> => {
    const rows = await executor.$queryRawUnsafe<{
      recorded_at: Date;
      event_id: string;
    }>(
      `
        select recorded_at, event_id
        from event
        order by recorded_at desc, event_id desc
        limit 1
      `,
    );
    const first = rows[0];
    if (first === undefined) {
      return null;
    }
    return encodeCursor({
      recordedAt: first.recorded_at.toISOString(),
      eventId: first.event_id,
    });
  };

  const pullEvents = async (
    cursor: string | null,
    limit: number,
  ): Promise<{ events: Event[]; nextCursor: string | null }> => {
    const effectiveLimit = Number.isInteger(limit) && limit > 0 && limit <= 500 ? limit : 100;
    const parsedCursor = cursor === null ? null : decodeCursor(cursor);
    if (cursor !== null && parsedCursor === null) {
      return {
        events: [],
        nextCursor: null,
      };
    }

    const rows =
      parsedCursor === null
        ? await executor.$queryRawUnsafe<StoredEventRow>(
            `
            select
              event_id,
              event_type::text as event_type,
              occurred_at,
              recorded_at,
              actor_user_id,
              device_id,
              location_text,
              schema_version,
              correlation_id,
              causation_id,
              payload
            from event
            order by recorded_at asc, event_id asc
            limit $1
          `,
            effectiveLimit,
          )
        : await executor.$queryRawUnsafe<StoredEventRow>(
            `
            select
              event_id,
              event_type::text as event_type,
              occurred_at,
              recorded_at,
              actor_user_id,
              device_id,
              location_text,
              schema_version,
              correlation_id,
              causation_id,
              payload
            from event
            where (recorded_at, event_id) > ($1::timestamptz, $2::uuid)
            order by recorded_at asc, event_id asc
            limit $3
          `,
            parsedCursor.recordedAt,
            parsedCursor.eventId,
            effectiveLimit,
          );

    if (rows.length === 0) {
      return {
        events: [],
        nextCursor: cursor,
      };
    }

    const events = rows.map(mapStoredEvent);
    const lastRow = rows[rows.length - 1];
    if (lastRow === undefined) {
      return {
        events,
        nextCursor: cursor,
      };
    }
    return {
      events,
      nextCursor: encodeCursor({
        recordedAt: lastRow.recorded_at.toISOString(),
        eventId: lastRow.event_id,
      }),
    };
  };

  const getProjectionFreshness = async (): Promise<ProjectionFreshnessRecord> => {
    const rows = await executor.$queryRawUnsafe<{
      refreshed_at: Date;
      cursor_recorded_at: Date | null;
      cursor_event_id: string | null;
    }>(
      `
        select refreshed_at, cursor_recorded_at, cursor_event_id
        from projection_freshness
        where key = 'default'
        limit 1
      `,
    );
    const first = rows[0];
    if (first === undefined) {
      return {
        refreshedAt: null,
        cursor: null,
      };
    }
    return {
      refreshedAt: first.refreshed_at.toISOString(),
      cursor:
        first.cursor_recorded_at === null || first.cursor_event_id === null
          ? null
          : encodeCursor({
              recordedAt: first.cursor_recorded_at.toISOString(),
              eventId: first.cursor_event_id,
            }),
    };
  };

  return {
    appendEvent,
    getLatestCursor,
    pullEvents,
    getProjectionFreshness,
  };
};
