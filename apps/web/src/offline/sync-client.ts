import type { Event } from "../../../../packages/shared/src/domain/events";
import type {
  SyncCursor,
  SyncPullResponse,
  SyncPushAck,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatusResponse,
} from "../../../../packages/shared/src/domain/sync";
import type { EventQueue } from "./event-queue";
import { createApiClient } from "./api-client";
import type { SyncStateStore } from "./sync-state-store";

type SyncClientOptions = {
  queue: EventQueue;
  syncStateStore: SyncStateStore;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  batchSize?: number;
};

export type SyncRunResult = {
  acknowledgedCount: number;
  rejectedCount: number;
  pulledCount: number;
  latestCursor: SyncCursor | null;
  status: SyncStatusResponse;
  pendingCount: number;
  lastSyncAt: string;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ensureNullableString = (value: unknown, fieldName: string): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
};

const parsePushResponse = (value: unknown): SyncPushResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid sync push response");
  }
  const acknowledgementsRaw = value["acknowledgements"];
  if (!Array.isArray(acknowledgementsRaw)) {
    throw new Error("Invalid sync push response acknowledgements");
  }

  const acknowledgements: SyncPushAck[] = acknowledgementsRaw.map((ack) => {
    if (!isRecord(ack)) {
      throw new Error("Invalid sync push acknowledgement");
    }
    const eventId = ack["eventId"];
    const status = ack["status"];
    const reason = ack["reason"];
    if (typeof eventId !== "string") {
      throw new Error("Invalid sync push acknowledgement eventId");
    }
    if (status !== "accepted" && status !== "duplicate" && status !== "rejected") {
      throw new Error("Invalid sync push acknowledgement status");
    }
    if (reason !== undefined && typeof reason !== "string") {
      throw new Error("Invalid sync push acknowledgement reason");
    }
    if (reason === undefined) {
      return {
        eventId,
        status,
      };
    }
    return {
      eventId,
      status,
      reason,
    };
  });

  const latestCursor = ensureNullableString(value["latestCursor"], "sync push latestCursor");
  return {
    acknowledgements,
    latestCursor,
  };
};

const parsePullResponse = (value: unknown): SyncPullResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid sync pull response");
  }
  const eventsRaw = value["events"];
  if (!Array.isArray(eventsRaw)) {
    throw new Error("Invalid sync pull response events");
  }
  const events = eventsRaw as Event[];
  const nextCursor = ensureNullableString(value["nextCursor"], "sync pull nextCursor");
  return {
    events,
    nextCursor,
  };
};

const parseStatusResponse = (value: unknown): SyncStatusResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid sync status response");
  }
  return {
    latestCursor: ensureNullableString(value["latestCursor"], "sync status latestCursor"),
    projectionRefreshedAt: ensureNullableString(
      value["projectionRefreshedAt"],
      "sync status projectionRefreshedAt",
    ),
    projectionCursor: ensureNullableString(
      value["projectionCursor"],
      "sync status projectionCursor",
    ),
  };
};

export const createSyncClient = (
  options: SyncClientOptions,
): { runSyncCycle: () => Promise<SyncRunResult> } => {
  const batchSize = options.batchSize ?? 100;
  const apiClient = createApiClient({
    ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const runSyncCycle = async (): Promise<SyncRunResult> => {
    const queuedEvents = await options.queue.dequeueBatch(batchSize);
    let cursor = await options.syncStateStore.getCursor();

    let acknowledgedCount = 0;
    let rejectedCount = 0;

    if (queuedEvents.length > 0) {
      const pushBody: SyncPushRequest = {
        events: queuedEvents,
        lastKnownCursor: cursor,
      };
      const pushResponse = await apiClient.request({
        method: "POST",
        path: "/sync/push",
        body: pushBody,
      });
      if (!pushResponse.ok) {
        throw new Error(`Sync push failed with status ${String(pushResponse.status)}`);
      }
      const pushJson = await apiClient.readJson<unknown>(pushResponse, "sync push");
      const parsedPush = parsePushResponse(pushJson);
      const ackIds = parsedPush.acknowledgements
        .filter((ack) => ack.status === "accepted" || ack.status === "duplicate")
        .map((ack) => ack.eventId);

      acknowledgedCount = ackIds.length;
      rejectedCount = parsedPush.acknowledgements.filter((ack) => ack.status === "rejected").length;

      if (ackIds.length > 0) {
        await options.queue.ack(ackIds);
      }

      if (parsedPush.latestCursor !== null) {
        cursor = parsedPush.latestCursor;
        await options.syncStateStore.setCursor(cursor);
      }
    }

    let pulledCount = 0;
    let pullIterations = 0;
    while (pullIterations < 10) {
      pullIterations += 1;
      const query =
        cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}&limit=${String(batchSize)}`;
      const pullResponse = await apiClient.request({
        method: "GET",
        path: `/sync/pull${query}`,
      });
      if (!pullResponse.ok) {
        throw new Error(`Sync pull failed with status ${String(pullResponse.status)}`);
      }
      const pullJson = await apiClient.readJson<unknown>(pullResponse, "sync pull");
      const parsedPull = parsePullResponse(pullJson);
      pulledCount += parsedPull.events.length;

      const previousCursor = cursor;
      const nextCursor = parsedPull.nextCursor;
      if (nextCursor !== previousCursor) {
        cursor = nextCursor;
        await options.syncStateStore.setCursor(cursor);
      }

      if (parsedPull.events.length === 0 || nextCursor === previousCursor) {
        break;
      }
    }

    const statusResponse = await apiClient.request({
      method: "GET",
      path: "/sync/status",
    });
    if (!statusResponse.ok) {
      throw new Error(`Sync status failed with status ${String(statusResponse.status)}`);
    }
    const statusJson = await apiClient.readJson<unknown>(statusResponse, "sync status");
    const status = parseStatusResponse(statusJson);

    const latestCursor = status.latestCursor ?? cursor;
    if (latestCursor !== cursor) {
      cursor = latestCursor;
      await options.syncStateStore.setCursor(cursor);
    }

    const lastSyncAt = new Date().toISOString();
    await options.syncStateStore.setLastSyncAt(lastSyncAt);

    return {
      acknowledgedCount,
      rejectedCount,
      pulledCount,
      latestCursor: cursor,
      status,
      pendingCount: await options.queue.pendingCount(),
      lastSyncAt,
    };
  };

  return {
    runSyncCycle,
  };
};
