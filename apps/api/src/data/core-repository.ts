import type { Event } from "../../../../packages/shared/src/domain/events";
import { normalizePointValue } from "../../../../packages/shared/src/domain/points";
import type {
  SyncAuditEventResponse,
  SyncAuditIssue,
  SyncAuditReportResponse,
  SyncReconciliationIssue,
  SyncReconciliationIssueCode,
  SyncReconciliationRepair,
  SyncReconciliationReportResponse,
  SyncRepairReconciliationIssueResponse,
  SyncConflictsResponse,
  SyncCursor,
  SyncResolveConflictRequest,
  SyncResolveConflictResponse,
} from "../../../../packages/shared/src/domain/sync";
import type { PrismaClient } from "@prisma/client";
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

type InventoryBatchCostStateRecord = InventoryBatchStateRecord & {
  unitCost: number | null;
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

type MaterialsCollectedReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
  materialTypeId: string | null;
};

type MaterialsCollectedReportRow = {
  day: string;
  materialTypeId: string;
  materialName: string;
  locationText: string;
  totalWeightKg: number;
  totalPoints: number;
};

type SalesReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
  itemId: string | null;
};

type SalesReportRow = {
  day: string;
  itemId: string;
  itemName: string;
  locationText: string;
  totalQuantity: number;
  totalPoints: number;
  saleCount: number;
};

type SalesReportResult = {
  rows: SalesReportRow[];
  summary: {
    totalQuantity: number;
    totalPoints: number;
    saleCount: number;
  };
};

type CashflowReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
};

type CashflowReportRow = {
  day: string;
  salesPointsValue: number;
  expenseCashTotal: number;
  netCashflow: number;
  saleCount: number;
  expenseCount: number;
};

type CashflowExpenseCategoryRow = {
  category: string;
  totalCashAmount: number;
  expenseCount: number;
};

type CashflowReportResult = {
  rows: CashflowReportRow[];
  summary: {
    totalSalesPointsValue: number;
    totalExpenseCash: number;
    netCashflow: number;
    saleCount: number;
    expenseCount: number;
  };
  expenseCategories: CashflowExpenseCategoryRow[];
};

type PointsLiabilityReportFilter = {
  search: string | null;
};

type PointsLiabilityReportRow = {
  personId: string;
  name: string;
  surname: string;
  balancePoints: number;
};

type PointsLiabilityReportResult = {
  rows: PointsLiabilityReportRow[];
  summary: {
    totalOutstandingPoints: number;
    personCount: number;
  };
};

type InventoryStatusLogReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  fromStatus: InventoryStatus | null;
  toStatus: InventoryStatus | null;
};

type InventoryStatusReportSummaryRow = {
  status: InventoryStatus;
  totalQuantity: number;
  totalCostValue: number;
};

type InventoryStatusReportRow = {
  status: InventoryStatus;
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCostValue: number;
};

type InventoryStatusReportResult = {
  summary: InventoryStatusReportSummaryRow[];
  rows: InventoryStatusReportRow[];
};

type InventoryStatusLogReportRow = {
  eventId: string;
  eventType: "inventory.status_changed" | "inventory.adjustment_applied";
  occurredAt: string;
  inventoryBatchId: string;
  itemId: string | null;
  itemName: string | null;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason: string | null;
  notes: string | null;
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
  balance_points: unknown;
};

type LedgerEntryRow = {
  id: string;
  person_id: string;
  delta_points: unknown;
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

type InventoryStatusLogEventRow = {
  event_id: string;
  event_type: string;
  occurred_at: Date;
  payload: unknown;
};

type SalesReportEventRow = {
  event_id: string;
  occurred_at: Date;
  location_text: string | null;
  payload: unknown;
};

type CashflowReportEventRow = {
  event_id: string;
  event_type: string;
  occurred_at: Date;
  location_text: string | null;
  payload: unknown;
};

type MaterialsCollectedReportQueryRow = {
  day: Date;
  material_type_id: string;
  material_name: string;
  location_text: string;
  total_weight_kg: unknown;
  total_points: unknown;
};

type PointsLiabilityReportQueryRow = {
  person_id: string;
  name: string;
  surname: string;
  balance_points: unknown;
  total_outstanding_points: unknown;
  person_count: number;
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

type ReconciliationIssueCursorParts = {
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

type ProjectedPointsBalanceRow = {
  person_id: string;
  balance_points: unknown;
};

type ReconciliationRepairResult =
  | { ok: true; value: SyncRepairReconciliationIssueResponse }
  | { ok: false; error: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" };

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
};

const toPointNumber = (value: unknown): number => normalizePointValue(toNumber(value));

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

const encodeReconciliationIssueCursor = (parts: ReconciliationIssueCursorParts): SyncCursor =>
  Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");

const decodeReconciliationIssueCursor = (
  cursor: SyncCursor | null,
): ReconciliationIssueCursorParts | null => {
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
    return { detectedAt, issueId };
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
  pointsPerKg: toPointNumber(material.pointsPerKg),
});

const toItemRecord = (item: {
  id: string;
  name: string;
  pointsPrice: unknown;
  costPrice: unknown | null;
  sku: string | null;
}): ItemRecord => ({
  id: item.id,
  name: item.name,
  pointsPrice: toPointNumber(item.pointsPrice),
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

const createInventoryBatchCostState = (
  inventoryBatchId: string,
  itemId: string | null,
  unitCost: number | null,
): InventoryBatchCostStateRecord => ({
  inventoryBatchId,
  itemId,
  unitCost,
  quantities: createEmptyInventoryQuantities(),
});

const compareSyncCursors = (left: SyncCursor | null, right: SyncCursor | null): number => {
  if (left === right) {
    return 0;
  }
  const decodedLeft = decodeSyncCursor(left);
  const decodedRight = decodeSyncCursor(right);
  if (decodedLeft === null || decodedRight === null) {
    if (left === null) {
      return -1;
    }
    if (right === null) {
      return 1;
    }
    return left.localeCompare(right);
  }
  if (decodedLeft.recordedAt !== decodedRight.recordedAt) {
    return decodedLeft.recordedAt.localeCompare(decodedRight.recordedAt);
  }
  return decodedLeft.eventId.localeCompare(decodedRight.eventId);
};

const isRepairableReconciliationCode = (code: SyncReconciliationIssueCode): boolean =>
  code === "POINTS_BALANCE_MISMATCH" ||
  code === "INVENTORY_STATUS_SUMMARY_MISMATCH" ||
  code === "INVENTORY_BATCH_NEGATIVE_QUANTITY" ||
  code === "PROJECTION_CURSOR_DRIFT";

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

  const listInventoryBatchCostState = async (): Promise<InventoryBatchCostStateRecord[]> => {
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
    const stateByBatch = new Map<string, InventoryBatchCostStateRecord>();
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
          const unitCost = lineRecord["unitCost"];
          if (
            typeof inventoryBatchId !== "string" ||
            typeof itemId !== "string" ||
            typeof quantity !== "number" ||
            !Number.isFinite(quantity) ||
            typeof unitCost !== "number" ||
            !Number.isFinite(unitCost)
          ) {
            continue;
          }
          const existing =
            stateByBatch.get(inventoryBatchId) ??
            createInventoryBatchCostState(inventoryBatchId, itemId, unitCost);
          existing.itemId = itemId;
          existing.unitCost = unitCost;
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
          const existing =
            stateByBatch.get(inventoryBatchId) ??
            createInventoryBatchCostState(inventoryBatchId, itemId, null);
          existing.itemId = itemId;
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
      const existing =
        stateByBatch.get(inventoryBatchId) ??
        createInventoryBatchCostState(inventoryBatchId, null, null);
      existing.quantities[fromStatus as InventoryStatus] -= quantity;
      existing.quantities[toStatus as InventoryStatus] += quantity;
      stateByBatch.set(inventoryBatchId, existing);
    }
    return Array.from(stateByBatch.values());
  };

  const listInventoryBatches = async (): Promise<InventoryBatchStateRecord[]> => {
    const batches = await listInventoryBatchCostState();
    return batches.map((batch) => ({
      inventoryBatchId: batch.inventoryBatchId,
      itemId: batch.itemId,
      quantities: {
        storage: batch.quantities.storage,
        shop: batch.quantities.shop,
        sold: batch.quantities.sold,
        spoiled: batch.quantities.spoiled,
        damaged: batch.quantities.damaged,
        missing: batch.quantities.missing,
      },
    }));
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
      balancePoints: toPointNumber(row.balance_points),
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
      deltaPoints: toPointNumber(row.delta_points),
      occurredAt: row.occurred_at.toISOString(),
      sourceEventType: row.source_event_type,
      sourceEventId: row.source_event_id,
    }));
  };

  const getLivePointsBalance = async (personId: string): Promise<number> => {
    const rows = await prisma.$queryRaw<
      {
        balance_points: unknown;
      }[]
    >`
      with ledger as (
        select
          case
            when event_type = 'intake.recorded' then (payload ->> 'totalPoints')::numeric(12, 1)
            when event_type = 'sale.recorded' then ((payload ->> 'totalPoints')::numeric(12, 1) * -1)
            when event_type = 'points.adjustment_applied' then (payload ->> 'deltaPoints')::numeric(12, 1)
            else 0
          end as delta_points
        from event
        where payload ->> 'personId' = ${personId}
          and event_type in ('intake.recorded', 'sale.recorded', 'points.adjustment_applied')
      )
      select coalesce(sum(delta_points), 0)::numeric(12, 1) as balance_points
      from ledger
    `;
    const first = rows[0];
    if (first === undefined) {
      return 0;
    }
    return toPointNumber(first.balance_points);
  };

  const listMaterialsCollectedReport = async (
    filters: MaterialsCollectedReportFilter,
  ): Promise<MaterialsCollectedReportRow[]> => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.fromDate !== null) {
      params.push(filters.fromDate);
      conditions.push(`day >= $${String(params.length)}::date`);
    }
    if (filters.toDate !== null) {
      params.push(filters.toDate);
      conditions.push(`day <= $${String(params.length)}::date`);
    }
    if (filters.locationText !== null) {
      params.push(`%${filters.locationText.toLowerCase()}%`);
      conditions.push(`lower(location_text) like $${String(params.length)}`);
    }
    if (filters.materialTypeId !== null) {
      params.push(filters.materialTypeId);
      conditions.push(`material_type_id = $${String(params.length)}`);
    }
    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = await prisma.$queryRawUnsafe<MaterialsCollectedReportQueryRow[]>(
      `
        select
          day,
          material_type_id,
          material_name,
          location_text,
          total_weight_kg,
          total_points
        from mv_materials_collected_daily
        ${whereClause}
        order by day desc, material_name asc, location_text asc
      `,
      ...params,
    );
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      materialTypeId: row.material_type_id,
      materialName: row.material_name,
      locationText: row.location_text,
      totalWeightKg: Number(row.total_weight_kg),
      totalPoints: toPointNumber(row.total_points),
    }));
  };

  const listSalesReport = async (filters: SalesReportFilter): Promise<SalesReportResult> => {
    const [rows, items] = await Promise.all([
      prisma.$queryRaw<SalesReportEventRow[]>`
        select event_id, occurred_at, location_text, payload
        from event
        where event_type = 'sale.recorded'
        order by occurred_at desc, event_id desc
      `,
      listItems(),
    ]);
    const itemNameById = new Map(items.map((item) => [item.id, item.name] as const));
    const grouped = new Map<
      string,
      {
        row: SalesReportRow;
        eventIds: Set<string>;
      }
    >();

    for (const eventRow of rows) {
      const day = eventRow.occurred_at.toISOString().slice(0, 10);
      const eventLocationText = eventRow.location_text ?? "Unknown";
      if (filters.fromDate !== null && day < filters.fromDate) {
        continue;
      }
      if (filters.toDate !== null && day > filters.toDate) {
        continue;
      }
      if (
        filters.locationText !== null &&
        !eventLocationText.toLowerCase().includes(filters.locationText.toLowerCase())
      ) {
        continue;
      }
      const payload = eventRow.payload as Record<string, unknown>;
      const linesRaw = payload["lines"];
      if (!Array.isArray(linesRaw)) {
        continue;
      }
      for (const line of linesRaw) {
        if (typeof line !== "object" || line === null || Array.isArray(line)) {
          continue;
        }
        const lineRecord = line as Record<string, unknown>;
        const itemId = lineRecord["itemId"];
        const quantity = lineRecord["quantity"];
        const lineTotalPoints = lineRecord["lineTotalPoints"];
        if (
          typeof itemId !== "string" ||
          typeof quantity !== "number" ||
          !Number.isInteger(quantity) ||
          typeof lineTotalPoints !== "number"
        ) {
          continue;
        }
        if (filters.itemId !== null && itemId !== filters.itemId) {
          continue;
        }
        const itemName = itemNameById.get(itemId) ?? itemId;
        const key = `${day}:${eventLocationText}:${itemId}`;
        const existing = grouped.get(key) ?? {
          row: {
            day,
            itemId,
            itemName,
            locationText: eventLocationText,
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          eventIds: new Set<string>(),
        };
        existing.row.totalQuantity += quantity;
        existing.row.totalPoints = normalizePointValue(existing.row.totalPoints + lineTotalPoints);
        existing.eventIds.add(eventRow.event_id);
        existing.row.saleCount = existing.eventIds.size;
        grouped.set(key, existing);
      }
    }

    const resultRows = Array.from(grouped.values())
      .map((entry) => entry.row)
      .sort((left, right) => {
        if (left.day !== right.day) {
          return right.day.localeCompare(left.day);
        }
        if (left.locationText !== right.locationText) {
          return left.locationText.localeCompare(right.locationText);
        }
        if (left.itemName !== right.itemName) {
          return left.itemName.localeCompare(right.itemName);
        }
        return left.itemId.localeCompare(right.itemId);
      });

    return {
      rows: resultRows,
      summary: {
        totalQuantity: resultRows.reduce((sum, row) => sum + row.totalQuantity, 0),
        totalPoints: resultRows.reduce((sum, row) => normalizePointValue(sum + row.totalPoints), 0),
        saleCount: resultRows.reduce((sum, row) => sum + row.saleCount, 0),
      },
    };
  };

  const listCashflowReport = async (
    filters: CashflowReportFilter,
  ): Promise<CashflowReportResult> => {
    const rows = await prisma.$queryRaw<CashflowReportEventRow[]>`
      select event_id, event_type::text as event_type, occurred_at, location_text, payload
      from event
      where event_type in ('sale.recorded', 'expense.recorded')
      order by occurred_at desc, event_id desc
    `;
    const dayTotals = new Map<
      string,
      {
        salesPointsValue: number;
        expenseCashTotal: number;
        saleCount: number;
        expenseCount: number;
      }
    >();
    const categoryTotals = new Map<
      string,
      {
        totalCashAmount: number;
        expenseCount: number;
      }
    >();

    for (const eventRow of rows) {
      const day = eventRow.occurred_at.toISOString().slice(0, 10);
      if (filters.fromDate !== null && day < filters.fromDate) {
        continue;
      }
      if (filters.toDate !== null && day > filters.toDate) {
        continue;
      }
      if (filters.locationText !== null) {
        const eventLocation = eventRow.location_text;
        if (
          eventLocation === null ||
          !eventLocation.toLowerCase().includes(filters.locationText.toLowerCase())
        ) {
          continue;
        }
      }
      const dayEntry = dayTotals.get(day) ?? {
        salesPointsValue: 0,
        expenseCashTotal: 0,
        saleCount: 0,
        expenseCount: 0,
      };
      const payload = eventRow.payload as Record<string, unknown>;
      if (eventRow.event_type === "sale.recorded") {
        const totalPoints = payload["totalPoints"];
        if (typeof totalPoints !== "number" || !Number.isFinite(totalPoints)) {
          continue;
        }
        dayEntry.salesPointsValue = normalizePointValue(dayEntry.salesPointsValue + totalPoints);
        dayEntry.saleCount += 1;
        dayTotals.set(day, dayEntry);
        continue;
      }
      if (eventRow.event_type === "expense.recorded") {
        const cashAmount = payload["cashAmount"];
        const category = payload["category"];
        if (
          typeof cashAmount !== "number" ||
          !Number.isFinite(cashAmount) ||
          typeof category !== "string"
        ) {
          continue;
        }
        dayEntry.expenseCashTotal = Number((dayEntry.expenseCashTotal + cashAmount).toFixed(2));
        dayEntry.expenseCount += 1;
        dayTotals.set(day, dayEntry);

        const categoryEntry = categoryTotals.get(category) ?? {
          totalCashAmount: 0,
          expenseCount: 0,
        };
        categoryEntry.totalCashAmount = Number(
          (categoryEntry.totalCashAmount + cashAmount).toFixed(2),
        );
        categoryEntry.expenseCount += 1;
        categoryTotals.set(category, categoryEntry);
      }
    }

    const resultRows = Array.from(dayTotals.entries())
      .map(([day, totals]) => ({
        day,
        salesPointsValue: totals.salesPointsValue,
        expenseCashTotal: totals.expenseCashTotal,
        netCashflow: Number((totals.salesPointsValue - totals.expenseCashTotal).toFixed(2)),
        saleCount: totals.saleCount,
        expenseCount: totals.expenseCount,
      }))
      .sort((left, right) => right.day.localeCompare(left.day));

    const expenseCategories = Array.from(categoryTotals.entries())
      .map(([category, totals]) => ({
        category,
        totalCashAmount: totals.totalCashAmount,
        expenseCount: totals.expenseCount,
      }))
      .sort((left, right) => {
        if (left.totalCashAmount !== right.totalCashAmount) {
          return right.totalCashAmount - left.totalCashAmount;
        }
        return left.category.localeCompare(right.category);
      });

    return {
      rows: resultRows,
      summary: {
        totalSalesPointsValue: resultRows.reduce(
          (sum, row) => normalizePointValue(sum + row.salesPointsValue),
          0,
        ),
        totalExpenseCash: resultRows.reduce(
          (sum, row) => Number((sum + row.expenseCashTotal).toFixed(2)),
          0,
        ),
        netCashflow: Number(
          (
            resultRows.reduce((sum, row) => normalizePointValue(sum + row.salesPointsValue), 0) -
            resultRows.reduce((sum, row) => Number((sum + row.expenseCashTotal).toFixed(2)), 0)
          ).toFixed(2),
        ),
        saleCount: resultRows.reduce((sum, row) => sum + row.saleCount, 0),
        expenseCount: resultRows.reduce((sum, row) => sum + row.expenseCount, 0),
      },
      expenseCategories,
    };
  };

  const listPointsLiabilityReport = async (
    filters: PointsLiabilityReportFilter,
  ): Promise<PointsLiabilityReportResult> => {
    const conditions = ["b.balance_points > 0"];
    const params: unknown[] = [];
    if (filters.search !== null) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.name) like $${String(params.length)} or lower(p.surname) like $${String(params.length)})`,
      );
    }
    const whereClause = `where ${conditions.join(" and ")}`;
    const rows = await prisma.$queryRawUnsafe<PointsLiabilityReportQueryRow[]>(
      `
        select
          b.person_id,
          p.name,
          p.surname,
          b.balance_points,
          coalesce(sum(b.balance_points) over (), 0)::numeric(12, 1) as total_outstanding_points,
          count(*) over ()::integer as person_count
        from mv_points_balances b
        join mv_people p on p.id = b.person_id
        ${whereClause}
        order by b.balance_points desc, p.surname asc, p.name asc, b.person_id asc
      `,
      ...params,
    );
    const firstRow = rows[0];
    return {
      rows: rows.map((row) => ({
        personId: row.person_id,
        name: row.name,
        surname: row.surname,
        balancePoints: toPointNumber(row.balance_points),
      })),
      summary: {
        totalOutstandingPoints:
          firstRow === undefined ? 0 : toPointNumber(firstRow.total_outstanding_points),
        personCount: firstRow?.person_count ?? 0,
      },
    };
  };

  const listInventoryStatusReport = async (): Promise<InventoryStatusReportResult> => {
    const [batches, items] = await Promise.all([listInventoryBatchCostState(), listItems()]);
    const itemNameById = new Map(items.map((item) => [item.id, item.name] as const));
    const summaryTotals = new Map<
      InventoryStatus,
      { totalQuantity: number; totalCostValue: number }
    >();
    const detailTotals = new Map<
      string,
      {
        status: InventoryStatus;
        itemId: string;
        itemName: string;
        quantity: number;
        unitCost: number;
        totalCostValue: number;
      }
    >();

    for (const status of INVENTORY_STATUSES) {
      summaryTotals.set(status, { totalQuantity: 0, totalCostValue: 0 });
    }

    for (const batch of batches) {
      if (batch.itemId === null || batch.unitCost === null) {
        continue;
      }
      const itemName = itemNameById.get(batch.itemId) ?? batch.itemId;
      for (const status of INVENTORY_STATUSES) {
        const quantity = batch.quantities[status];
        if (quantity === 0) {
          continue;
        }
        const totalCostValue = Number((quantity * batch.unitCost).toFixed(2));
        const summary = summaryTotals.get(status);
        if (summary !== undefined) {
          summary.totalQuantity += quantity;
          summary.totalCostValue = Number((summary.totalCostValue + totalCostValue).toFixed(2));
        }
        const key = `${status}:${batch.itemId}:${batch.unitCost.toFixed(2)}`;
        const detail = detailTotals.get(key) ?? {
          status,
          itemId: batch.itemId,
          itemName,
          quantity: 0,
          unitCost: batch.unitCost,
          totalCostValue: 0,
        };
        detail.quantity += quantity;
        detail.totalCostValue = Number((detail.totalCostValue + totalCostValue).toFixed(2));
        detailTotals.set(key, detail);
      }
    }

    const statusOrder = new Map(
      INVENTORY_STATUSES.map((status, index) => [status, index] as const),
    );

    return {
      summary: INVENTORY_STATUSES.map((status) => {
        const totals = summaryTotals.get(status);
        return {
          status,
          totalQuantity: totals?.totalQuantity ?? 0,
          totalCostValue: totals?.totalCostValue ?? 0,
        };
      }),
      rows: Array.from(detailTotals.values())
        .filter((row) => row.quantity > 0)
        .sort((left, right) => {
          const statusDiff =
            (statusOrder.get(left.status) ?? Number.MAX_SAFE_INTEGER) -
            (statusOrder.get(right.status) ?? Number.MAX_SAFE_INTEGER);
          if (statusDiff !== 0) {
            return statusDiff;
          }
          if (left.itemName !== right.itemName) {
            return left.itemName.localeCompare(right.itemName);
          }
          return left.itemId.localeCompare(right.itemId);
        }),
    };
  };

  const listInventoryStatusLogReport = async (
    filters: InventoryStatusLogReportFilter,
  ): Promise<InventoryStatusLogReportRow[]> => {
    const [batches, items, rows] = await Promise.all([
      listInventoryBatchCostState(),
      listItems(),
      prisma.$queryRaw<InventoryStatusLogEventRow[]>`
        select event_id, event_type::text as event_type, occurred_at, payload
        from event
        where event_type in (
          'inventory.status_changed',
          'inventory.adjustment_applied',
          'inventory.adjustment_requested'
        )
        order by occurred_at desc, event_id desc
      `,
    ]);
    const itemNameById = new Map(items.map((item) => [item.id, item.name] as const));
    const batchItemById = new Map(
      batches.map((batch) => [batch.inventoryBatchId, batch.itemId] as const),
    );

    return rows
      .filter(
        (row) =>
          row.event_type === "inventory.status_changed" ||
          row.event_type === "inventory.adjustment_applied",
      )
      .map((row) => {
        const payload = row.payload as Record<string, unknown>;
        const inventoryBatchId = payload["inventoryBatchId"];
        const fromStatus = payload["fromStatus"];
        const toStatus = payload["toStatus"];
        const quantity = payload["quantity"];
        const reason = payload["reason"];
        const notes = payload["notes"];
        if (
          typeof inventoryBatchId !== "string" ||
          typeof fromStatus !== "string" ||
          typeof toStatus !== "string" ||
          typeof quantity !== "number" ||
          !Number.isInteger(quantity) ||
          !INVENTORY_STATUSES.includes(fromStatus as InventoryStatus) ||
          !INVENTORY_STATUSES.includes(toStatus as InventoryStatus)
        ) {
          return null;
        }
        const itemId = batchItemById.get(inventoryBatchId) ?? null;
        return {
          eventId: row.event_id,
          eventType: row.event_type as InventoryStatusLogReportRow["eventType"],
          occurredAt: row.occurred_at.toISOString(),
          inventoryBatchId,
          itemId,
          itemName: itemId === null ? null : (itemNameById.get(itemId) ?? null),
          fromStatus: fromStatus as InventoryStatus,
          toStatus: toStatus as InventoryStatus,
          quantity,
          reason: typeof reason === "string" ? reason : null,
          notes: typeof notes === "string" ? notes : null,
        } satisfies InventoryStatusLogReportRow;
      })
      .filter((row): row is InventoryStatusLogReportRow => row !== null)
      .filter((row) => {
        const occurredDate = row.occurredAt.slice(0, 10);
        const inFrom = filters.fromDate === null || occurredDate >= filters.fromDate;
        const inTo = filters.toDate === null || occurredDate <= filters.toDate;
        const inFromStatus = filters.fromStatus === null || row.fromStatus === filters.fromStatus;
        const inToStatus = filters.toStatus === null || row.toStatus === filters.toStatus;
        return inFrom && inTo && inFromStatus && inToStatus;
      });
  };

  const buildSyncReconciliationIssues = async (): Promise<SyncReconciliationIssue[]> => {
    const [projectedBalances, projectedInventorySummary, replayedBatches, syncStatus] =
      await Promise.all([
        prisma.$queryRaw<ProjectedPointsBalanceRow[]>`
          select person_id, balance_points
          from mv_points_balances
        `,
        listInventoryStatusSummary(),
        listInventoryBatches(),
        getSyncStatus(),
      ]);

    const issues: SyncReconciliationIssue[] = [];
    const detectedAt = new Date().toISOString();

    const projectedBalanceByPersonId = new Map(
      projectedBalances.map((row) => [row.person_id, toPointNumber(row.balance_points)] as const),
    );
    const allPersonIds = new Set<string>(projectedBalanceByPersonId.keys());
    for (const personId of projectedBalanceByPersonId.keys()) {
      allPersonIds.add(personId);
    }
    for (const personId of projectedBalanceByPersonId.keys()) {
      allPersonIds.add(personId);
    }
    const personRows = await prisma.person.findMany({
      select: {
        id: true,
      },
    });
    for (const person of personRows) {
      allPersonIds.add(person.id);
    }

    for (const rawPersonId of allPersonIds) {
      const personId = String(rawPersonId);
      const expectedBalance = await getLivePointsBalance(personId);
      const actualBalance = projectedBalanceByPersonId.get(personId) ?? 0;
      if (expectedBalance === actualBalance) {
        continue;
      }
      const deltaPoints = normalizePointValue(expectedBalance - actualBalance);
      const suggestedRepair: SyncReconciliationRepair | null =
        deltaPoints === 0
          ? null
          : {
              repairKind: "points_adjustment",
              deltaPoints,
              reasonTemplate: "Reconciliation correction for points balance mismatch",
            };
      issues.push({
        issueId: `POINTS_BALANCE_MISMATCH:${personId}`,
        code: "POINTS_BALANCE_MISMATCH",
        severity: "error",
        entityType: "person",
        entityId: personId,
        detail: "Projected balance does not match event-log balance.",
        detectedAt,
        expected: { balancePoints: expectedBalance },
        actual: { balancePoints: actualBalance },
        suggestedRepair,
      });
    }

    const replayedInventoryTotals = new Map<InventoryStatus, number>();
    for (const status of INVENTORY_STATUSES) {
      replayedInventoryTotals.set(status, 0);
    }
    for (const batch of replayedBatches) {
      for (const status of INVENTORY_STATUSES) {
        replayedInventoryTotals.set(
          status,
          (replayedInventoryTotals.get(status) ?? 0) + batch.quantities[status],
        );
        if (batch.quantities[status] >= 0) {
          continue;
        }
        const correctiveQuantity = Math.abs(batch.quantities[status]);
        const donorStatus =
          INVENTORY_STATUSES.find(
            (candidate) =>
              candidate !== status && batch.quantities[candidate] >= correctiveQuantity,
          ) ?? null;
        issues.push({
          issueId: `INVENTORY_BATCH_NEGATIVE_QUANTITY:${batch.inventoryBatchId}:${status}`,
          code: "INVENTORY_BATCH_NEGATIVE_QUANTITY",
          severity: "error",
          entityType: "inventory_batch",
          entityId: batch.inventoryBatchId,
          detail: `Replay-derived quantity for ${status} is negative.`,
          detectedAt,
          expected: { quantity: 0, status },
          actual: { quantity: batch.quantities[status], status },
          suggestedRepair:
            donorStatus === null
              ? null
              : {
                  repairKind: "inventory_adjustment",
                  inventoryBatchId: batch.inventoryBatchId,
                  fromStatus: donorStatus,
                  toStatus: status,
                  quantity: correctiveQuantity,
                  reasonTemplate: "Reconciliation correction for negative inventory quantity",
                },
        });
      }
    }

    for (const projectedStatus of projectedInventorySummary) {
      const expectedQuantity = replayedInventoryTotals.get(projectedStatus.status) ?? 0;
      if (expectedQuantity === projectedStatus.totalQuantity) {
        continue;
      }
      issues.push({
        issueId: `INVENTORY_STATUS_SUMMARY_MISMATCH:${projectedStatus.status}`,
        code: "INVENTORY_STATUS_SUMMARY_MISMATCH",
        severity: "warning",
        entityType: "inventory_status_summary",
        entityId: projectedStatus.status,
        detail: "Projected inventory status summary does not match replay totals.",
        detectedAt,
        expected: { totalQuantity: expectedQuantity, status: projectedStatus.status },
        actual: { totalQuantity: projectedStatus.totalQuantity, status: projectedStatus.status },
        suggestedRepair: {
          repairKind: "projection_rebuild",
          reasonTemplate: "Rebuild projections for inventory summary reconciliation",
        },
      });
    }

    if (compareSyncCursors(syncStatus.projectionCursor, syncStatus.latestCursor) < 0) {
      issues.push({
        issueId: "PROJECTION_CURSOR_DRIFT:default",
        code: "PROJECTION_CURSOR_DRIFT",
        severity: "warning",
        entityType: "projection",
        entityId: "default",
        detail: "Projection freshness cursor is behind the latest event cursor.",
        detectedAt,
        expected: { latestCursor: syncStatus.latestCursor },
        actual: { projectionCursor: syncStatus.projectionCursor },
        suggestedRepair: {
          repairKind: "projection_rebuild",
          reasonTemplate: "Rebuild projections for cursor drift reconciliation",
        },
      });
    }

    return issues.sort((left, right) => {
      if (left.detectedAt !== right.detectedAt) {
        return right.detectedAt.localeCompare(left.detectedAt);
      }
      return left.issueId.localeCompare(right.issueId);
    });
  };

  const listSyncReconciliationReport = async (
    limit: number,
    cursor: SyncCursor | null,
    code: SyncReconciliationIssueCode | null,
    repairableOnly: boolean,
  ): Promise<SyncReconciliationReportResponse> => {
    const effectiveLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const parsedCursor = decodeReconciliationIssueCursor(cursor);
    const allIssues = await buildSyncReconciliationIssues();
    const filtered = allIssues
      .filter((issue) => (code === null ? true : issue.code === code))
      .filter((issue) => (repairableOnly ? isRepairableReconciliationCode(issue.code) : true));
    const paged = parsedCursor
      ? filtered.filter(
          (issue) =>
            issue.detectedAt < parsedCursor.detectedAt ||
            (issue.detectedAt === parsedCursor.detectedAt && issue.issueId > parsedCursor.issueId),
        )
      : filtered;
    const issues = paged.slice(0, effectiveLimit);
    const lastIssue = issues[issues.length - 1];
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalIssues: filtered.length,
        errorCount: filtered.filter((issue) => issue.severity === "error").length,
        warningCount: filtered.filter((issue) => issue.severity === "warning").length,
        repairableCount: filtered.filter((issue) => issue.suggestedRepair !== null).length,
      },
      issues,
      nextCursor:
        issues.length < effectiveLimit || lastIssue === undefined
          ? null
          : encodeReconciliationIssueCursor({
              detectedAt: lastIssue.detectedAt,
              issueId: lastIssue.issueId,
            }),
    };
  };

  const repairSyncReconciliationIssue = async (
    issueId: string,
    notes: string,
    actor: StaffIdentity,
  ): Promise<ReconciliationRepairResult> => {
    if (notes.trim().length === 0) {
      return { ok: false, error: "BAD_REQUEST" };
    }
    const currentIssue = (await buildSyncReconciliationIssues()).find(
      (issue) => issue.issueId === issueId,
    );
    if (currentIssue === undefined || currentIssue.suggestedRepair === null) {
      return { ok: false, error: "NOT_FOUND" };
    }
    const currentRepair = currentIssue.suggestedRepair;
    if (currentRepair === undefined || currentRepair === null) {
      return { ok: false, error: "NOT_FOUND" };
    }

    if (currentRepair.repairKind === "projection_rebuild") {
      await refreshProjections(prisma);
      return {
        ok: true,
        value: {
          issueId,
          repairKind: "projection_rebuild",
          rebuiltAt: new Date().toISOString(),
        },
      };
    }

    return prisma.$transaction(async (tx) => {
      const latestIssue = (await buildSyncReconciliationIssues()).find(
        (issue) => issue.issueId === issueId,
      );
      if (latestIssue === undefined || latestIssue.suggestedRepair === null) {
        return { ok: false, error: "NOT_FOUND" as const };
      }
      const latestRepair = latestIssue.suggestedRepair;
      if (latestRepair === undefined || latestRepair === null) {
        return { ok: false, error: "NOT_FOUND" as const };
      }
      if (latestRepair.repairKind !== currentRepair.repairKind) {
        return { ok: false, error: "CONFLICT" as const };
      }
      const txEventStore = createEventStore(tx);
      if (latestRepair.repairKind === "points_adjustment") {
        const pointsRepair = latestRepair;
        const repairEvent: Event = {
          eventId: randomUUID(),
          eventType: "points.adjustment_applied",
          occurredAt: new Date().toISOString(),
          actorUserId: actor.id,
          deviceId: "api-server",
          locationText: null,
          schemaVersion: 1,
          correlationId: null,
          causationId: null,
          payload: {
            requestEventId: null,
            personId: latestIssue.entityId,
            deltaPoints: pointsRepair.deltaPoints,
            reason: pointsRepair.reasonTemplate,
            notes,
          },
        };
        const appendResult = await txEventStore.appendEvent(repairEvent);
        if (appendResult.status !== "accepted") {
          return { ok: false, error: "CONFLICT" as const };
        }
        await projectEventToReadModels(tx, repairEvent);
        return {
          ok: true,
          value: {
            issueId,
            repairKind: "points_adjustment",
            repairEventId: repairEvent.eventId,
          },
        };
      }
      if (latestRepair.repairKind !== "inventory_adjustment") {
        return { ok: false, error: "CONFLICT" as const };
      }
      const inventoryRepair = latestRepair;
      const repairEvent: Event = {
        eventId: randomUUID(),
        eventType: "inventory.adjustment_applied",
        occurredAt: new Date().toISOString(),
        actorUserId: actor.id,
        deviceId: "api-server",
        locationText: null,
        schemaVersion: 1,
        correlationId: null,
        causationId: null,
        payload: {
          requestEventId: null,
          inventoryBatchId: inventoryRepair.inventoryBatchId,
          fromStatus: inventoryRepair.fromStatus,
          toStatus: inventoryRepair.toStatus,
          quantity: inventoryRepair.quantity,
          reason: inventoryRepair.reasonTemplate,
          notes,
        },
      };
      const appendResult = await txEventStore.appendEvent(repairEvent);
      if (appendResult.status !== "accepted") {
        return { ok: false, error: "CONFLICT" as const };
      }
      await projectEventToReadModels(tx, repairEvent);
      return {
        ok: true,
        value: {
          issueId,
          repairKind: "inventory_adjustment",
          repairEventId: repairEvent.eventId,
        },
      };
    });
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
    listMaterialsCollectedReport,
    listCashflowReport,
    listSalesReport,
    listPointsLiabilityReport,
    listInventoryStatusReport,
    listInventoryStatusLogReport,
    pullEvents,
    getSyncStatus,
    listSyncConflicts,
    resolveSyncConflict,
    listSyncAuditReport,
    getSyncAuditEvent,
    listSyncReconciliationReport,
    repairSyncReconciliationIssue,
  };
};
