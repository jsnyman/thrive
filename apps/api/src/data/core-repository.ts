import type { Event } from "../../../../packages/shared/src/domain/events";
import type {
  SyncAuditEventResponse,
  SyncAuditIssue,
  SyncAuditReportResponse,
  SyncConflictsResponse,
  SyncCursor,
  SyncResolveConflictRequest,
  SyncResolveConflictResponse,
} from "../../../../packages/shared/src/domain/sync";
import type { PrismaClient } from "../generated/prisma/client";
import { refreshProjections } from "../projections/refresh";
import { createEventStore, type AppendEventResult } from "./event-store";
import { projectEventToReadModels } from "./project-event";
import {
  applyAcceptedIncomingEvent,
  createMergeState,
  decodeSyncCursor,
  evaluateMergeDecision,
  type MergeRejectReason,
} from "./sync-merge-policy";
import { randomUUID } from "node:crypto";
import type { StaffIdentity } from "../auth";

type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";

type InventoryBatchStateRecord = {
  inventoryBatchId: string;
  itemId: string | null;
  quantities: Record<InventoryStatus, number>;
};

type InventoryStatusSummaryRecord = {
  status: InventoryStatus;
  totalQuantity: number;
};

type LedgerBalanceRecord = {
  personId: string;
  balancePoints: number;
};

type LedgerEntryRecord = {
  id: string;
  personId: string;
  deltaPoints: number;
  occurredAt: string;
  sourceEventType: string;
  sourceEventId: string;
};

type PullEventsResult = {
  events: Event[];
  nextCursor: SyncCursor | null;
};

type ProjectionStatusRecord = {
  latestCursor: SyncCursor | null;
  projectionRefreshedAt: string | null;
  projectionCursor: SyncCursor | null;
};

type LedgerBalanceRow = {
  person_id: string;
  balance_points: number;
};

type LedgerEntryRow = {
  id: string;
  person_id: string;
  delta_points: number;
  occurred_at: Date;
  source_event_type: string;
  source_event_id: string;
};

type InventoryStatusSummaryRow = {
  status: string;
  total_quantity: number;
};

type InventoryEventRow = {
  event_type: string;
  payload: unknown;
};

type CoreTransactionExecutor = Pick<
  PrismaClient,
  "$executeRawUnsafe" | "$queryRawUnsafe" | "person" | "materialType" | "item"
>;

type ConflictCursorParts = {
  recordedAt: string;
  eventId: string;
};

type ConflictListRow = {
  conflict_id: string;
  detected_event_id: string;
  detected_at: Date;
  entity_type:
    | "person"
    | "intake"
    | "sale"
    | "procurement"
    | "expense"
    | "inventory_batch"
    | "points_ledger";
  entity_id: string;
  detected_event_ids: string[];
  summary: string | null;
  resolution_event_id: string | null;
  resolved_at: Date | null;
  resolution_value: "accepted" | "rejected" | "merged" | null;
  resolution_notes: string | null;
  resolved_by_user_id: string | null;
};

type ConflictExistsRow = {
  detected_event_id: string;
};

type ConflictResolveAppendResult =
  | { ok: true; value: SyncResolveConflictResponse }
  | { ok: false; error: "CONFLICT_NOT_FOUND" | "ALREADY_RESOLVED" | "BAD_REQUEST" };

type AuditIssueCursorParts = {
  detectedAt: string;
  issueId: string;
};

type StoredEventLookupRow = {
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

type AuditMissingDetectedReferenceRow = {
  conflict_id: string;
  detected_event_id: string;
  detected_at: Date;
  missing_event_id: string;
};

type AuditOrphanResolutionRow = {
  conflict_id: string;
  resolution_event_id: string;
  detected_at: Date;
};

type AuditMissingResolvedEventRow = {
  conflict_id: string;
  resolution_event_id: string;
  detected_at: Date;
  missing_event_id: string;
};

type AuditMissingRelatedEventRow = {
  conflict_id: string;
  resolution_event_id: string;
  detected_at: Date;
  missing_event_id: string;
};

type AuditDuplicateConflictRow = {
  conflict_id: string;
  latest_detected_at: Date;
  detected_event_ids: string[];
};

type AuditDuplicateResolutionRow = {
  conflict_id: string;
  latest_resolved_at: Date;
  resolution_event_ids: string[];
};

type ProjectionCursorRow = {
  key: string;
  cursor_recorded_at: Date | null;
  cursor_event_id: string | null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
};

const encodeConflictCursor = (parts: ConflictCursorParts): SyncCursor =>
  Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");

const decodeConflictCursor = (cursor: SyncCursor | null): ConflictCursorParts | null => {
  if (cursor === null) {
    return null;
  }
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

const encodeAuditIssueCursor = (parts: AuditIssueCursorParts): SyncCursor =>
  Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");

const decodeAuditIssueCursor = (cursor: SyncCursor | null): AuditIssueCursorParts | null => {
  if (cursor === null) {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const detectedAt = parsed["detectedAt"];
    const issueId = parsed["issueId"];
    if (typeof detectedAt !== "string" || typeof issueId !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(detectedAt))) {
      return null;
    }
    return {
      detectedAt,
      issueId,
    };
  } catch {
    return null;
  }
};

const toPersonRecord = (person: {
  id: string;
  name: string;
  surname: string;
  idNumber: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}): PersonRecord => ({
  id: person.id,
  name: person.name,
  surname: person.surname,
  idNumber: person.idNumber,
  phone: person.phone,
  address: person.address,
  notes: person.notes,
});

const toMaterialRecord = (material: {
  id: string;
  name: string;
  pointsPerKg: unknown;
}): MaterialRecord => ({
  id: material.id,
  name: material.name,
  pointsPerKg: toNumber(material.pointsPerKg),
});

const toItemRecord = (item: {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice: unknown | null;
  sku: string | null;
}): ItemRecord => ({
  id: item.id,
  name: item.name,
  pointsPrice: item.pointsPrice,
  costPrice: item.costPrice === null ? null : toNumber(item.costPrice),
  sku: item.sku,
});

const INVENTORY_STATUSES: InventoryStatus[] = [
  "storage",
  "shop",
  "sold",
  "spoiled",
  "damaged",
  "missing",
];

const createEmptyInventoryQuantities = (): Record<InventoryStatus, number> => ({
  storage: 0,
  shop: 0,
  sold: 0,
  spoiled: 0,
  damaged: 0,
  missing: 0,
});

export const createCoreRepository = (prisma: PrismaClient) => {
  const eventStore = createEventStore(prisma);

  const listPeople = async (search?: string): Promise<PersonRecord[]> => {
    const hasSearch = search !== undefined && search.trim().length > 0;
    const rows = hasSearch
      ? await prisma.person.findMany({
          where: {
            OR: [
              {
                name: {
                  contains: search,
                },
              },
              {
                surname: {
                  contains: search,
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : await prisma.person.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });
    return rows.map(toPersonRecord);
  };

  const listMaterials = async (): Promise<MaterialRecord[]> => {
    const rows = await prisma.materialType.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toMaterialRecord);
  };

  const listItems = async (): Promise<ItemRecord[]> => {
    const rows = await prisma.item.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toItemRecord);
  };

  const listInventoryStatusSummary = async (): Promise<InventoryStatusSummaryRecord[]> => {
    const rows = await prisma.$queryRaw<InventoryStatusSummaryRow[]>`
      select status, total_quantity
      from mv_inventory_status_summary
    `;
    const totals = new Map<InventoryStatus, number>();
    for (const row of rows) {
      if (INVENTORY_STATUSES.includes(row.status as InventoryStatus)) {
        totals.set(row.status as InventoryStatus, row.total_quantity);
      }
    }
    return INVENTORY_STATUSES.map((status) => ({
      status,
      totalQuantity: totals.get(status) ?? 0,
    }));
  };

  const listInventoryBatches = async (): Promise<InventoryBatchStateRecord[]> => {
    const rows = await prisma.$queryRaw<InventoryEventRow[]>`
      select event_type::text as event_type, payload
      from event
      where event_type in (
        'procurement.recorded',
        'sale.recorded',
        'inventory.status_changed',
        'inventory.adjustment_applied'
      )
      order by recorded_at asc, event_id asc
    `;
    const stateByBatch = new Map<string, InventoryBatchStateRecord>();
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      if (row.event_type === "procurement.recorded") {
        const linesRaw = payload["lines"];
        if (!Array.isArray(linesRaw)) {
          continue;
        }
        for (const line of linesRaw) {
          if (typeof line !== "object" || line === null || Array.isArray(line)) {
            continue;
          }
          const lineRecord = line as Record<string, unknown>;
          const inventoryBatchId = lineRecord["inventoryBatchId"];
          const itemId = lineRecord["itemId"];
          const quantity = lineRecord["quantity"];
          if (
            typeof inventoryBatchId !== "string" ||
            typeof itemId !== "string" ||
            typeof quantity !== "number" ||
            !Number.isFinite(quantity)
          ) {
            continue;
          }
          const existing = stateByBatch.get(inventoryBatchId) ?? {
            inventoryBatchId,
            itemId,
            quantities: createEmptyInventoryQuantities(),
          };
          existing.quantities.storage += quantity;
          stateByBatch.set(inventoryBatchId, existing);
        }
        continue;
      }
      if (row.event_type === "sale.recorded") {
        const linesRaw = payload["lines"];
        if (!Array.isArray(linesRaw)) {
          continue;
        }
        for (const line of linesRaw) {
          if (typeof line !== "object" || line === null || Array.isArray(line)) {
            continue;
          }
          const lineRecord = line as Record<string, unknown>;
          const inventoryBatchId = lineRecord["inventoryBatchId"];
          const itemId = lineRecord["itemId"];
          const quantity = lineRecord["quantity"];
          if (
            typeof inventoryBatchId !== "string" ||
            typeof itemId !== "string" ||
            typeof quantity !== "number" ||
            !Number.isFinite(quantity)
          ) {
            continue;
          }
          const existing = stateByBatch.get(inventoryBatchId) ?? {
            inventoryBatchId,
            itemId,
            quantities: createEmptyInventoryQuantities(),
          };
          existing.quantities.shop -= quantity;
          existing.quantities.sold += quantity;
          stateByBatch.set(inventoryBatchId, existing);
        }
        continue;
      }

      const inventoryBatchId = payload["inventoryBatchId"];
      const fromStatus = payload["fromStatus"];
      const toStatus = payload["toStatus"];
      const quantity = payload["quantity"];
      if (
        typeof inventoryBatchId !== "string" ||
        typeof fromStatus !== "string" ||
        typeof toStatus !== "string" ||
        typeof quantity !== "number" ||
        !INVENTORY_STATUSES.includes(fromStatus as InventoryStatus) ||
        !INVENTORY_STATUSES.includes(toStatus as InventoryStatus)
      ) {
        continue;
      }
      const existing = stateByBatch.get(inventoryBatchId) ?? {
        inventoryBatchId,
        itemId: null,
        quantities: createEmptyInventoryQuantities(),
      };
      existing.quantities[fromStatus as InventoryStatus] -= quantity;
      existing.quantities[toStatus as InventoryStatus] += quantity;
      stateByBatch.set(inventoryBatchId, existing);
    }
    return Array.from(stateByBatch.values());
  };

  const listShopBatchesForItem = async (itemId: string): Promise<InventoryBatchStateRecord[]> => {
    const batches = await listInventoryBatches();
    return batches.filter((batch) => batch.itemId === itemId && batch.quantities.shop > 0);
  };

  const getInventoryBatchState = async (
    inventoryBatchId: string,
  ): Promise<InventoryBatchStateRecord | null> => {
    const batches = await listInventoryBatches();
    return batches.find((batch) => batch.inventoryBatchId === inventoryBatchId) ?? null;
  };

  const getPersonById = async (personId: string): Promise<PersonRecord | null> => {
    const row = await prisma.person.findUnique({
      where: {
        id: personId,
      },
    });
    if (row === null) {
      return null;
    }
    return toPersonRecord(row);
  };

  const getMaterialById = async (materialTypeId: string): Promise<MaterialRecord | null> => {
    const row = await prisma.materialType.findUnique({
      where: {
        id: materialTypeId,
      },
    });
    if (row === null) {
      return null;
    }
    return toMaterialRecord(row);
  };

  const getItemById = async (itemId: string): Promise<ItemRecord | null> => {
    const row = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
    });
    if (row === null) {
      return null;
    }
    return toItemRecord(row);
  };

  const appendEventAndProject = async (event: Event): Promise<AppendEventResult> => {
    const result = await prisma.$transaction(async (tx) => {
      const txEventStore = createEventStore(tx);
      const appendResult = await txEventStore.appendEvent(event);
      if (appendResult.status === "accepted") {
        await projectEventToReadModels(tx, event);
      }
      return appendResult;
    });

    if (result.status === "accepted") {
      await refreshProjections(prisma);
    }
    return result;
  };

  const appendConflictDetectedEvent = async (
    tx: CoreTransactionExecutor,
    sourceEvent: Event,
    conflict: {
      entityType:
        | "person"
        | "intake"
        | "sale"
        | "procurement"
        | "expense"
        | "inventory_batch"
        | "points_ledger";
      entityId: string;
      detectedEventIds: string[];
      summary: string;
    },
  ): Promise<Event> => {
    const conflictEvent: Event = {
      eventId: randomUUID(),
      eventType: "conflict.detected",
      occurredAt: new Date().toISOString(),
      actorUserId: sourceEvent.actorUserId,
      deviceId: sourceEvent.deviceId,
      locationText: sourceEvent.locationText ?? null,
      schemaVersion: 1,
      correlationId: sourceEvent.correlationId ?? null,
      causationId: sourceEvent.eventId,
      payload: {
        conflictId: randomUUID(),
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        detectedEventIds: conflict.detectedEventIds,
        summary: conflict.summary,
      },
    };
    const txEventStore = createEventStore(tx);
    const appendResult = await txEventStore.appendEvent(conflictEvent);
    if (appendResult.status !== "accepted") {
      throw new Error(
        `Failed to append conflict.detected: ${appendResult.reason ?? appendResult.status}`,
      );
    }
    await projectEventToReadModels(tx, conflictEvent);
    return conflictEvent;
  };

  const appendEvents = async (
    events: Event[],
    lastKnownCursor?: SyncCursor | null,
  ): Promise<AppendEventResult[]> => {
    const cursor = decodeSyncCursor(lastKnownCursor ?? null);
    const txResult = await prisma.$transaction(async (tx) => {
      const txEventStore = createEventStore(tx);
      const replayEvents = await txEventStore.listEventsForMergeReplay();
      const mergeState = createMergeState(replayEvents);
      const acknowledgements: AppendEventResult[] = [];
      let acceptedEvents = 0;

      for (const event of events) {
        const decision = evaluateMergeDecision(mergeState, event, cursor);
        if (decision.status === "duplicate") {
          acknowledgements.push({ status: "duplicate" });
          continue;
        }
        if (decision.status === "rejected") {
          if (
            decision.reason !== "INVALID_EVENT" &&
            decision.reason !== "UNSUPPORTED_MERGE_STATE"
          ) {
            if (decision.conflict !== undefined) {
              const conflictEvent = await appendConflictDetectedEvent(tx, event, decision.conflict);
              applyAcceptedIncomingEvent(mergeState, conflictEvent);
              acceptedEvents += 1;
            }
          }
          acknowledgements.push({
            status: "rejected",
            reason: decision.reason as MergeRejectReason,
          });
          continue;
        }

        const appendResult = await txEventStore.appendEvent(event);
        if (appendResult.status === "accepted") {
          await projectEventToReadModels(tx, event);
          applyAcceptedIncomingEvent(mergeState, event);
          acceptedEvents += 1;
          acknowledgements.push({ status: "accepted" });
          continue;
        }
        if (appendResult.status === "duplicate") {
          acknowledgements.push({ status: "duplicate" });
          continue;
        }
        acknowledgements.push({
          status: "rejected",
          reason: "INVALID_EVENT",
        });
      }

      return {
        acknowledgements,
        acceptedEvents,
      };
    });

    if (txResult.acceptedEvents > 0) {
      await refreshProjections(prisma);
    }

    return txResult.acknowledgements;
  };

  const getLedgerBalance = async (personId: string): Promise<LedgerBalanceRecord> => {
    const rows = await prisma.$queryRaw<LedgerBalanceRow[]>`
      select person_id, balance_points
      from mv_points_balances
      where person_id = ${personId}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return {
        personId,
        balancePoints: 0,
      };
    }
    return {
      personId: row.person_id,
      balancePoints: row.balance_points,
    };
  };

  const listLedgerEntries = async (personId: string): Promise<LedgerEntryRecord[]> => {
    const rows = await prisma.$queryRaw<LedgerEntryRow[]>`
      select id, person_id, delta_points, occurred_at, source_event_type, source_event_id
      from mv_points_ledger_entries
      where person_id = ${personId}
      order by occurred_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      personId: row.person_id,
      deltaPoints: row.delta_points,
      occurredAt: row.occurred_at.toISOString(),
      sourceEventType: row.source_event_type,
      sourceEventId: row.source_event_id,
    }));
  };

  const getLivePointsBalance = async (personId: string): Promise<number> => {
    const rows = await prisma.$queryRaw<
      {
        balance_points: number;
      }[]
    >`
      with ledger as (
        select
          case
            when event_type = 'intake.recorded' then (payload ->> 'totalPoints')::integer
            when event_type = 'sale.recorded' then ((payload ->> 'totalPoints')::integer * -1)
            when event_type = 'points.adjustment_applied' then (payload ->> 'deltaPoints')::integer
            else 0
          end as delta_points
        from event
        where payload ->> 'personId' = ${personId}
          and event_type in ('intake.recorded', 'sale.recorded', 'points.adjustment_applied')
      )
      select coalesce(sum(delta_points), 0)::integer as balance_points
      from ledger
    `;
    const first = rows[0];
    if (first === undefined) {
      return 0;
    }
    return first.balance_points;
  };

  const pullEvents = async (cursor: string | null, limit: number): Promise<PullEventsResult> =>
    eventStore.pullEvents(cursor, limit);

  const getSyncStatus = async (): Promise<ProjectionStatusRecord> => {
    const [latestCursor, freshness] = await Promise.all([
      eventStore.getLatestCursor(),
      eventStore.getProjectionFreshness(),
    ]);
    return {
      latestCursor,
      projectionRefreshedAt: freshness.refreshedAt,
      projectionCursor: freshness.cursor,
    };
  };

  const listSyncConflicts = async (
    status: "open" | "all",
    limit: number,
    cursor: SyncCursor | null,
  ): Promise<SyncConflictsResponse> => {
    const effectiveLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const parsedCursor = decodeConflictCursor(cursor);
    const hasCursor = parsedCursor !== null;
    const statusFilterSql =
      status === "open" ? "where latest_resolution.resolution_event_id is null" : "";
    const cursorFilterSql = hasCursor
      ? `${statusFilterSql.length > 0 ? " and " : "where "} (det.detected_at, det.detected_event_id) < ($1::timestamptz, $2::uuid)`
      : "";
    const limitPlaceholder = hasCursor ? "$3" : "$1";

    const query = `
      with detections as (
        select
          e.event_id as detected_event_id,
          e.recorded_at as detected_at,
          e.payload ->> 'conflictId' as conflict_id,
          e.payload ->> 'entityType' as entity_type,
          e.payload ->> 'entityId' as entity_id,
          array(
            select jsonb_array_elements_text((e.payload -> 'detectedEventIds')::jsonb)
          ) as detected_event_ids,
          e.payload ->> 'summary' as summary
        from event e
        where e.event_type = 'conflict.detected'
      ),
      latest_resolution as (
        select distinct on (e.payload ->> 'conflictId')
          e.payload ->> 'conflictId' as conflict_id,
          e.event_id as resolution_event_id,
          e.recorded_at as resolved_at,
          e.payload ->> 'resolution' as resolution_value,
          e.payload ->> 'notes' as resolution_notes,
          e.actor_user_id as resolved_by_user_id
        from event e
        where e.event_type = 'conflict.resolved'
        order by e.payload ->> 'conflictId', e.recorded_at desc, e.event_id desc
      )
      select
        det.conflict_id,
        det.detected_event_id,
        det.detected_at,
        det.entity_type,
        det.entity_id,
        det.detected_event_ids,
        det.summary,
        latest_resolution.resolution_event_id,
        latest_resolution.resolved_at,
        latest_resolution.resolution_value,
        latest_resolution.resolution_notes,
        latest_resolution.resolved_by_user_id
      from detections det
      left join latest_resolution
        on latest_resolution.conflict_id = det.conflict_id
      ${statusFilterSql}
      ${cursorFilterSql}
      order by det.detected_at desc, det.detected_event_id desc
      limit ${limitPlaceholder}
    `;

    const rows = hasCursor
      ? await prisma.$queryRawUnsafe<ConflictListRow[]>(
          query,
          parsedCursor.recordedAt,
          parsedCursor.eventId,
          effectiveLimit,
        )
      : await prisma.$queryRawUnsafe<ConflictListRow[]>(query, effectiveLimit);

    const conflicts = rows.map((row) => ({
      conflictId: row.conflict_id,
      detectedEventId: row.detected_event_id,
      detectedAt: row.detected_at.toISOString(),
      entityType: row.entity_type,
      entityId: row.entity_id,
      detectedEventIds: row.detected_event_ids,
      summary: row.summary,
      resolved: row.resolution_event_id !== null,
      resolvedAt: row.resolved_at === null ? null : row.resolved_at.toISOString(),
      resolution: row.resolution_value,
      resolutionEventId: row.resolution_event_id,
      resolutionNotes: row.resolution_notes,
      resolvedByUserId: row.resolved_by_user_id,
    }));

    const lastRow = rows[rows.length - 1];
    const nextCursor =
      rows.length < effectiveLimit || lastRow === undefined
        ? null
        : encodeConflictCursor({
            recordedAt: lastRow.detected_at.toISOString(),
            eventId: lastRow.detected_event_id,
          });

    return {
      conflicts,
      nextCursor,
    };
  };

  const resolveSyncConflict = async (
    conflictId: string,
    request: SyncResolveConflictRequest,
    actor: StaffIdentity,
  ): Promise<ConflictResolveAppendResult> => {
    if (request.notes.trim().length === 0) {
      return { ok: false, error: "BAD_REQUEST" };
    }

    return prisma.$transaction(async (tx) => {
      const detections = await tx.$queryRawUnsafe<ConflictExistsRow[]>(
        `
          select e.event_id as detected_event_id
          from event e
          where e.event_type = 'conflict.detected'
            and e.payload ->> 'conflictId' = $1
          limit 1
        `,
        conflictId,
      );
      if (detections[0] === undefined) {
        return { ok: false, error: "CONFLICT_NOT_FOUND" as const };
      }

      const existingResolutions = await tx.$queryRawUnsafe<ConflictExistsRow[]>(
        `
          select e.event_id as detected_event_id
          from event e
          where e.event_type = 'conflict.resolved'
            and e.payload ->> 'conflictId' = $1
          limit 1
        `,
        conflictId,
      );
      if (existingResolutions[0] !== undefined) {
        return { ok: false, error: "ALREADY_RESOLVED" as const };
      }

      const resolutionEvent: Event = {
        eventId: randomUUID(),
        eventType: "conflict.resolved",
        occurredAt: new Date().toISOString(),
        actorUserId: actor.id,
        deviceId: "api-server",
        locationText: null,
        schemaVersion: 1,
        correlationId: null,
        causationId: null,
        payload: {
          conflictId,
          resolution: request.resolution,
          resolvedEventId: request.resolvedEventId ?? null,
          relatedEventIds: request.relatedEventIds ?? null,
          notes: request.notes,
        },
      };
      const txEventStore = createEventStore(tx);
      const appendResult = await txEventStore.appendEvent(resolutionEvent);
      if (appendResult.status !== "accepted") {
        return { ok: false, error: "BAD_REQUEST" as const };
      }
      await projectEventToReadModels(tx, resolutionEvent);
      return {
        ok: true,
        value: {
          conflictId,
          resolutionEventId: resolutionEvent.eventId,
        },
      };
    });
  };

  const listSyncAuditReport = async (
    limit: number,
    cursor: SyncCursor | null,
  ): Promise<SyncAuditReportResponse> => {
    const effectiveLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const parsedCursor = decodeAuditIssueCursor(cursor);

    const [
      missingDetectedRefs,
      orphanResolutions,
      missingResolvedEvents,
      missingRelatedEvents,
      duplicateConflicts,
      duplicateResolutions,
      projectionCursorRows,
      latestEventRows,
    ] = await Promise.all([
      prisma.$queryRawUnsafe<AuditMissingDetectedReferenceRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            e.event_id as detected_event_id,
            e.recorded_at as detected_at,
            ref.missing_event_id as missing_event_id
          from event e
          join lateral (
            select jsonb_array_elements_text((e.payload -> 'detectedEventIds')::jsonb) as missing_event_id
          ) ref on true
          where e.event_type = 'conflict.detected'
            and not exists (
              select 1 from event ev where ev.event_id::text = ref.missing_event_id
            )
        `,
      ),
      prisma.$queryRawUnsafe<AuditOrphanResolutionRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            e.event_id as resolution_event_id,
            e.recorded_at as detected_at
          from event e
          where e.event_type = 'conflict.resolved'
            and not exists (
              select 1
              from event det
              where det.event_type = 'conflict.detected'
                and det.payload ->> 'conflictId' = e.payload ->> 'conflictId'
            )
        `,
      ),
      prisma.$queryRawUnsafe<AuditMissingResolvedEventRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            e.event_id as resolution_event_id,
            e.recorded_at as detected_at,
            e.payload ->> 'resolvedEventId' as missing_event_id
          from event e
          where e.event_type = 'conflict.resolved'
            and e.payload ? 'resolvedEventId'
            and e.payload ->> 'resolvedEventId' is not null
            and not exists (
              select 1 from event ev where ev.event_id::text = e.payload ->> 'resolvedEventId'
            )
        `,
      ),
      prisma.$queryRawUnsafe<AuditMissingRelatedEventRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            e.event_id as resolution_event_id,
            e.recorded_at as detected_at,
            rel.related_event_id as missing_event_id
          from event e
          join lateral (
            select jsonb_array_elements_text((e.payload -> 'relatedEventIds')::jsonb) as related_event_id
          ) rel on true
          where e.event_type = 'conflict.resolved'
            and e.payload ? 'relatedEventIds'
            and not exists (
              select 1 from event ev where ev.event_id::text = rel.related_event_id
            )
        `,
      ),
      prisma.$queryRawUnsafe<AuditDuplicateConflictRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            max(e.recorded_at) as latest_detected_at,
            array_agg(e.event_id::text order by e.recorded_at desc, e.event_id desc) as detected_event_ids
          from event e
          where e.event_type = 'conflict.detected'
          group by e.payload ->> 'conflictId'
          having count(*) > 1
        `,
      ),
      prisma.$queryRawUnsafe<AuditDuplicateResolutionRow[]>(
        `
          select
            e.payload ->> 'conflictId' as conflict_id,
            max(e.recorded_at) as latest_resolved_at,
            array_agg(e.event_id::text order by e.recorded_at desc, e.event_id desc) as resolution_event_ids
          from event e
          where e.event_type = 'conflict.resolved'
          group by e.payload ->> 'conflictId'
          having count(*) > 1
        `,
      ),
      prisma.$queryRawUnsafe<ProjectionCursorRow[]>(
        `
          select key, cursor_recorded_at, cursor_event_id
          from projection_freshness
        `,
      ),
      prisma.$queryRawUnsafe<{ recorded_at: Date; event_id: string }[]>(
        `
          select recorded_at, event_id
          from event
          order by recorded_at desc, event_id desc
          limit 1
        `,
      ),
    ]);

    const issues: SyncAuditIssue[] = [];

    for (const row of missingDetectedRefs) {
      issues.push({
        issueId: `missing-detected-ref:${row.detected_event_id}:${row.missing_event_id}`,
        code: "MISSING_DETECTED_EVENT_REFERENCE",
        detectedAt: row.detected_at.toISOString(),
        severity: "error",
        detail: `conflict.detected references missing event ${row.missing_event_id}`,
        relatedEventIds: [row.detected_event_id, row.missing_event_id],
        conflictId: row.conflict_id,
      });
    }
    for (const row of orphanResolutions) {
      issues.push({
        issueId: `orphan-resolution:${row.resolution_event_id}`,
        code: "ORPHAN_CONFLICT_RESOLUTION",
        detectedAt: row.detected_at.toISOString(),
        severity: "error",
        detail: "conflict.resolved has no matching conflict.detected",
        relatedEventIds: [row.resolution_event_id],
        conflictId: row.conflict_id,
      });
    }
    for (const row of missingResolvedEvents) {
      issues.push({
        issueId: `missing-resolved-ref:${row.resolution_event_id}:${row.missing_event_id}`,
        code: "MISSING_RESOLVED_EVENT_REFERENCE",
        detectedAt: row.detected_at.toISOString(),
        severity: "error",
        detail: `resolvedEventId points to missing event ${row.missing_event_id}`,
        relatedEventIds: [row.resolution_event_id, row.missing_event_id],
        conflictId: row.conflict_id,
      });
    }
    for (const row of missingRelatedEvents) {
      issues.push({
        issueId: `missing-related-ref:${row.resolution_event_id}:${row.missing_event_id}`,
        code: "MISSING_RELATED_EVENT_REFERENCE",
        detectedAt: row.detected_at.toISOString(),
        severity: "error",
        detail: `relatedEventIds includes missing event ${row.missing_event_id}`,
        relatedEventIds: [row.resolution_event_id, row.missing_event_id],
        conflictId: row.conflict_id,
      });
    }
    for (const row of duplicateConflicts) {
      issues.push({
        issueId: `duplicate-conflict:${row.conflict_id}`,
        code: "DUPLICATE_CONFLICT_ID",
        detectedAt: row.latest_detected_at.toISOString(),
        severity: "warning",
        detail: "Multiple conflict.detected events share the same conflictId",
        relatedEventIds: row.detected_event_ids,
        conflictId: row.conflict_id,
      });
    }
    for (const row of duplicateResolutions) {
      issues.push({
        issueId: `duplicate-resolution:${row.conflict_id}`,
        code: "DUPLICATE_CONFLICT_RESOLUTION",
        detectedAt: row.latest_resolved_at.toISOString(),
        severity: "warning",
        detail: "Multiple conflict.resolved events share the same conflictId",
        relatedEventIds: row.resolution_event_ids,
        conflictId: row.conflict_id,
      });
    }

    const latestEvent = latestEventRows[0];
    for (const row of projectionCursorRows) {
      if (row.cursor_recorded_at === null || row.cursor_event_id === null) {
        continue;
      }
      const cursorRecordedAt = row.cursor_recorded_at.toISOString();
      const cursorEventId = row.cursor_event_id;
      const cursorExists = await prisma.$queryRawUnsafe<{ event_id: string }[]>(
        `
          select event_id
          from event
          where event_id = $1::uuid and recorded_at = $2::timestamptz
          limit 1
        `,
        cursorEventId,
        cursorRecordedAt,
      );
      if (cursorExists[0] === undefined) {
        issues.push({
          issueId: `projection-cursor-missing:${row.key}`,
          code: "PROJECTION_CURSOR_MISSING_EVENT",
          detectedAt: new Date().toISOString(),
          severity: "error",
          detail: `projection_freshness cursor for ${row.key} points to a missing event`,
          relatedEventIds: [cursorEventId],
        });
        continue;
      }
      if (latestEvent !== undefined) {
        const latestRecordedAt = latestEvent.recorded_at.toISOString();
        const outOfRange =
          cursorRecordedAt > latestRecordedAt ||
          (cursorRecordedAt === latestRecordedAt && cursorEventId > latestEvent.event_id);
        if (outOfRange) {
          issues.push({
            issueId: `projection-cursor-range:${row.key}`,
            code: "PROJECTION_CURSOR_OUT_OF_RANGE",
            detectedAt: new Date().toISOString(),
            severity: "error",
            detail: `projection_freshness cursor for ${row.key} is beyond latest event`,
            relatedEventIds: [cursorEventId, latestEvent.event_id],
          });
        }
      }
    }

    const sorted = issues.sort((left, right) => {
      if (left.detectedAt !== right.detectedAt) {
        return right.detectedAt.localeCompare(left.detectedAt);
      }
      return left.issueId.localeCompare(right.issueId);
    });

    const filtered = parsedCursor
      ? sorted.filter(
          (issue) =>
            issue.detectedAt < parsedCursor.detectedAt ||
            (issue.detectedAt === parsedCursor.detectedAt && issue.issueId > parsedCursor.issueId),
        )
      : sorted;
    const page = filtered.slice(0, effectiveLimit);
    const last = page[page.length - 1];
    const nextCursor =
      page.length < effectiveLimit || last === undefined
        ? null
        : encodeAuditIssueCursor({
            detectedAt: last.detectedAt,
            issueId: last.issueId,
          });
    const errorCount = issues.filter((issue) => issue.severity === "error").length;
    const warningCount = issues.filter((issue) => issue.severity === "warning").length;

    return {
      generatedAt: new Date().toISOString(),
      totalIssues: issues.length,
      errorCount,
      warningCount,
      issues: page,
      nextCursor,
    };
  };

  const getSyncAuditEvent = async (eventId: string): Promise<SyncAuditEventResponse | null> => {
    const rows = await prisma.$queryRawUnsafe<StoredEventLookupRow[]>(
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
        where event_id = $1::uuid
        limit 1
      `,
      eventId,
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const event = {
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
    } as Event;

    const linkedConflictRows = await prisma.$queryRawUnsafe<{ conflict_id: string }[]>(
      `
        select distinct e.payload ->> 'conflictId' as conflict_id
        from event e
        where (e.event_type = 'conflict.detected' and (
          e.event_id = $1::uuid
          or exists (
            select 1
            from jsonb_array_elements_text((e.payload -> 'detectedEventIds')::jsonb) ref
            where ref = $1::text
          )
        ))
        or (e.event_type = 'conflict.resolved' and (
          e.event_id = $1::uuid
          or e.payload ->> 'resolvedEventId' = $1::text
          or exists (
            select 1
            from jsonb_array_elements_text((e.payload -> 'relatedEventIds')::jsonb) rel
            where rel = $1::text
          )
        ))
      `,
      eventId,
    );
    const linkedResolutionRows = await prisma.$queryRawUnsafe<{ event_id: string }[]>(
      `
        select e.event_id::text as event_id
        from event e
        where e.event_type = 'conflict.resolved'
          and (
            e.event_id = $1::uuid
            or e.payload ->> 'resolvedEventId' = $1::text
            or exists (
              select 1
              from jsonb_array_elements_text((e.payload -> 'relatedEventIds')::jsonb) rel
              where rel = $1::text
            )
          )
      `,
      eventId,
    );

    return {
      event,
      linkedConflictIds: linkedConflictRows
        .map((rowItem) => rowItem.conflict_id)
        .filter((value): value is string => typeof value === "string"),
      linkedResolutionEventIds: linkedResolutionRows.map((rowItem) => rowItem.event_id),
    };
  };

  return {
    listPeople,
    listMaterials,
    listItems,
    listInventoryBatches,
    listShopBatchesForItem,
    listInventoryStatusSummary,
    getPersonById,
    getMaterialById,
    getItemById,
    getInventoryBatchState,
    appendEventAndProject,
    appendEvents,
    getLedgerBalance,
    listLedgerEntries,
    getLivePointsBalance,
    pullEvents,
    getSyncStatus,
    listSyncConflicts,
    resolveSyncConflict,
    listSyncAuditReport,
    getSyncAuditEvent,
  };
};
