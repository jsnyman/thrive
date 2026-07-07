import supertest = require("supertest");
import type { Event } from "../../../../packages/shared/src/domain/events";
import { normalizePointValue, sumPointValues } from "../../../../packages/shared/src/domain/points";
import type {
  SyncAuditIssue,
  SyncConflictRecord,
  SyncReconciliationIssue,
  SyncResolveConflictRequest,
} from "../../../../packages/shared/src/domain/sync";
import { createPasscodeHash, type AuthConfig, type StaffUserRecord } from "../auth";
import { createApiServer, type ApiServerDependencies } from "./server";
import type { ApiErrorLogger } from "./error-logger";

type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  balancePoints?: number;
  assignedCollectionPointId?: string | null;
};

type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

type CollectionPointRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
type InventoryAdjustmentStatus = "spoiled" | "damaged" | "missing";
type StaffRole = "user" | "administrator";

type InventoryBatchRecord = {
  inventoryBatchId: string;
  itemId: string;
  quantities: Record<InventoryStatus, number>;
};

type InventoryStatusSummaryRecord = {
  status: InventoryStatus;
  totalQuantity: number;
};

type LedgerEntryRecord = {
  id: string;
  personId: string;
  deltaPoints: number;
  occurredAt: string;
  sourceEventType: string;
  sourceEventId: string;
};

type MaterialsCollectedReportRow = {
  day: string;
  materialTypeId: string;
  materialName: string;
  locationText: string;
  totalWeightKg: number;
  totalPoints: number;
};

type PointsLiabilityReportRow = {
  personId: string;
  name: string;
  surname: string;
  balancePoints: number;
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

type ProcurementRecordLine = {
  itemId: string;
  inventoryBatchId: string;
  quantity: number;
  unitCost: number;
  lineTotalCost: number;
  unitSellingPrice: number;
  markupPercent: number;
};

type ProcurementRecord = {
  procurementEventId: string;
  occurredAt: string;
  supplierName: string | null;
  tripDistanceKm: number | null;
  cashTotal: number;
  lines: ProcurementRecordLine[];
  isEditable: boolean;
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

type AdjustmentRequestRecord = {
  requestEventId: string;
  requestType: "points" | "inventory";
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedByUserId: string;
  personId: string | null;
  inventoryBatchId: string | null;
  requestedStatus: InventoryAdjustmentStatus | null;
  deltaPoints: number | null;
  quantity: number;
  reason: string;
  notes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
};

const administratorPasscode = "1234";
const userPasscode = "9999";

const users: StaffUserRecord[] = [
  {
    id: "2772c203-5df5-4967-9341-09e391f4cb90",
    username: "administrator",
    passcodeHash: createPasscodeHash(administratorPasscode),
    role: "administrator",
  },
  {
    id: "4145d4dd-8421-4f5f-806b-fb4ccbd6596f",
    username: "user",
    passcodeHash: createPasscodeHash(userPasscode),
    role: "user",
  },
];

const authConfig: AuthConfig = {
  secret: "core-http-test-secret",
  tokenTtlSeconds: 3600,
};

const getUserByUsername = async (username: string): Promise<StaffUserRecord | null> =>
  users.find((user) => user.username === username) ?? null;

const baseNow = new Date("2026-03-05T12:00:00.000Z");

const createDependencies = (options?: {
  inventoryBatches?: InventoryBatchRecord[];
}): ApiServerDependencies => {
  const people: PersonRecord[] = [
    {
      id: "person-a",
      name: "Alice",
      surname: "Zulu",
      idNumber: "8001015009087",
      phone: "0821234567",
      balancePoints: 0,
    },
  ];
  const materials: MaterialRecord[] = [
    {
      id: "mat-1",
      name: "PET",
      pointsPerKg: 3.2,
    },
  ];
  const collectionPoints: CollectionPointRecord[] = [
    {
      id: "cp-1",
      name: "Heuwelkroon parkie",
      isActive: true,
    },
    {
      id: "cp-2",
      name: "Old Village Point",
      isActive: false,
    },
  ];
  const items: ItemRecord[] = [
    {
      id: "item-1",
      name: "Soap",
      pointsPrice: 10.5,
    },
  ];
  const inventoryBatches: InventoryBatchRecord[] = options?.inventoryBatches?.map((batch) => ({
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
  })) ?? [
    {
      inventoryBatchId: "batch-1",
      itemId: "item-1",
      quantities: {
        storage: 10,
        shop: 0,
        sold: 0,
        spoiled: 0,
        damaged: 0,
        missing: 0,
      },
    },
  ];
  const events: Event[] = [];
  const staffUsers: Array<{ id: string; username: string; role: StaffRole; passcodeHash: string }> =
    users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      passcodeHash: user.passcodeHash,
    }));
  const auditIssues: SyncAuditIssue[] = [
    {
      issueId: "issue-1",
      code: "DUPLICATE_CONFLICT_ID",
      detectedAt: "2026-03-05T11:30:00.000Z",
      severity: "warning",
      detail: "duplicate conflict",
      relatedEventIds: ["event-a", "event-b"],
      conflictId: "conflict-open",
    },
  ];
  const reconciliationIssues: SyncReconciliationIssue[] = [
    {
      issueId: "POINTS_BALANCE_MISMATCH:person-a",
      code: "POINTS_BALANCE_MISMATCH",
      severity: "error",
      entityType: "person",
      entityId: "person-a",
      detail: "Projected balance does not match event-log balance.",
      detectedAt: "2026-03-05T11:45:00.000Z",
      expected: { balancePoints: 33.3 },
      actual: { balancePoints: 30.3 },
      suggestedRepair: {
        repairKind: "points_adjustment",
        deltaPoints: 3,
        reasonTemplate: "Reconciliation correction for points balance mismatch",
      },
    },
    {
      issueId: "PROJECTION_CURSOR_DRIFT:default",
      code: "PROJECTION_CURSOR_DRIFT",
      severity: "warning",
      entityType: "projection",
      entityId: "default",
      detail: "Projection freshness cursor is behind the latest event cursor.",
      detectedAt: "2026-03-05T11:40:00.000Z",
      expected: { latestCursor: "cursor-2" },
      actual: { projectionCursor: "cursor-1" },
      suggestedRepair: {
        repairKind: "projection_rebuild",
        reasonTemplate: "Rebuild projections for cursor drift reconciliation",
      },
    },
  ];
  const conflicts: SyncConflictRecord[] = [
    {
      conflictId: "conflict-open",
      detectedEventId: "event-detected-open",
      detectedAt: "2026-03-05T11:00:00.000Z",
      entityType: "sale",
      entityId: "person-a",
      detectedEventIds: ["event-a", "event-b"],
      summary: "STALE_CURSOR_CONFLICT",
      resolved: false,
      resolvedAt: null,
      resolution: null,
      resolutionEventId: null,
      resolutionNotes: null,
      resolvedByUserId: null,
    },
    {
      conflictId: "conflict-resolved",
      detectedEventId: "event-detected-resolved",
      detectedAt: "2026-03-05T10:00:00.000Z",
      entityType: "person",
      entityId: "person-b",
      detectedEventIds: ["event-c", "event-d"],
      summary: "ENTITY_ALREADY_EXISTS",
      resolved: true,
      resolvedAt: "2026-03-05T10:05:00.000Z",
      resolution: "accepted",
      resolutionEventId: "event-resolve-1",
      resolutionNotes: "resolved",
      resolvedByUserId: users[0]?.id ?? null,
    },
  ];
  const ledger: LedgerEntryRecord[] = [
    {
      id: "event-1",
      personId: "person-a",
      deltaPoints: 50.4,
      occurredAt: "2026-03-04T10:00:00.000Z",
      sourceEventType: "intake.recorded",
      sourceEventId: "event-1",
    },
    {
      id: "event-2",
      personId: "person-a",
      deltaPoints: -20.1,
      occurredAt: "2026-03-04T11:00:00.000Z",
      sourceEventType: "sale.recorded",
      sourceEventId: "event-2",
    },
  ];
  const materialsReportRows: MaterialsCollectedReportRow[] = [
    {
      day: "2026-03-04",
      materialTypeId: "mat-1",
      materialName: "PET",
      locationText: "Village A",
      totalWeightKg: 2.9,
      totalPoints: 8.7,
    },
    {
      day: "2026-02-20",
      materialTypeId: "mat-1",
      materialName: "PET",
      locationText: "Village B",
      totalWeightKg: 1.2,
      totalPoints: 3,
    },
  ];
  const pointsLiabilityReportRows: PointsLiabilityReportRow[] = [
    {
      personId: "person-a",
      name: "Alice",
      surname: "Zulu",
      balancePoints: 30.3,
    },
    {
      personId: "person-b",
      name: "Jane",
      surname: "Doe",
      balancePoints: 8.4,
    },
    {
      personId: "person-c",
      name: "Zero",
      surname: "Balance",
      balancePoints: 0,
    },
  ];
  const inventoryStatusReport = {
    summary: [
      { status: "storage" as const, totalQuantity: 6, totalCostValue: 25.5 },
      { status: "shop" as const, totalQuantity: 3, totalCostValue: 12.75 },
      { status: "sold" as const, totalQuantity: 1, totalCostValue: 4.25 },
      { status: "spoiled" as const, totalQuantity: 0, totalCostValue: 0 },
      { status: "damaged" as const, totalQuantity: 0, totalCostValue: 0 },
      { status: "missing" as const, totalQuantity: 0, totalCostValue: 0 },
    ] satisfies InventoryStatusReportSummaryRow[],
    rows: [
      {
        status: "storage" as const,
        itemId: "item-1",
        itemName: "Soap",
        quantity: 6,
        unitCost: 4.25,
        totalCostValue: 25.5,
      },
      {
        status: "shop" as const,
        itemId: "item-1",
        itemName: "Soap",
        quantity: 3,
        unitCost: 4.25,
        totalCostValue: 12.75,
      },
      {
        status: "sold" as const,
        itemId: "item-1",
        itemName: "Soap",
        quantity: 1,
        unitCost: 4.25,
        totalCostValue: 4.25,
      },
    ] satisfies InventoryStatusReportRow[],
  };
  const inventoryStatusLogReportRows: InventoryStatusLogReportRow[] = [
    {
      eventId: "evt-log-2",
      eventType: "inventory.adjustment_applied",
      occurredAt: "2026-03-04T11:00:00.000Z",
      inventoryBatchId: "batch-unknown",
      itemId: null,
      itemName: null,
      fromStatus: "shop",
      toStatus: "damaged",
      quantity: 1,
      reason: "broken",
      notes: "corner tear",
    },
    {
      eventId: "evt-log-1",
      eventType: "inventory.status_changed",
      occurredAt: "2026-03-04T10:00:00.000Z",
      inventoryBatchId: "batch-1",
      itemId: "item-1",
      itemName: "Soap",
      fromStatus: "storage",
      toStatus: "shop",
      quantity: 4,
      reason: "Move to shop",
      notes: null,
    },
  ];
  const salesReportRows: SalesReportRow[] = [
    {
      day: "2026-03-04",
      itemId: "item-1",
      itemName: "Soap",
      locationText: "Village A",
      totalQuantity: 5,
      totalPoints: 52.5,
      saleCount: 2,
    },
    {
      day: "2026-03-05",
      itemId: "item-1",
      itemName: "Soap",
      locationText: "Unknown",
      totalQuantity: 1,
      totalPoints: 10.5,
      saleCount: 1,
    },
  ];
  const cashflowReportRows: CashflowReportRow[] = [
    {
      day: "2026-03-04",
      salesPointsValue: 52.5,
      expenseCashTotal: 18.5,
      netCashflow: 34,
      saleCount: 2,
      expenseCount: 2,
    },
    {
      day: "2026-03-05",
      salesPointsValue: 10.5,
      expenseCashTotal: 5.25,
      netCashflow: 5.25,
      saleCount: 1,
      expenseCount: 1,
    },
  ];
  const cashflowExpenseCategories: CashflowExpenseCategoryRow[] = [
    {
      category: "Fuel",
      totalCashAmount: 18.5,
      expenseCount: 2,
    },
    {
      category: "Supplies",
      totalCashAmount: 5.25,
      expenseCount: 1,
    },
  ];
  const procurements: ProcurementRecord[] = [];

  const isProcurementEditable = (procurement: ProcurementRecord): boolean =>
    procurement.lines.every((line) => {
      const batch = inventoryBatches.find(
        (entry) => entry.inventoryBatchId === line.inventoryBatchId,
      );
      if (batch === undefined) {
        return false;
      }
      return (
        batch.quantities.storage === line.quantity &&
        batch.quantities.shop === 0 &&
        batch.quantities.sold === 0 &&
        batch.quantities.spoiled === 0 &&
        batch.quantities.damaged === 0 &&
        batch.quantities.missing === 0
      );
    });

  const recomputeProcurementEditability = (): void => {
    for (const procurement of procurements) {
      procurement.isEditable = isProcurementEditable(procurement);
    }
  };

  const appendEventAndProject = async (event: Event) => {
    events.push(event);
    if (event.eventType === "person.created") {
      people.push({
        id: event.payload.personId,
        name: event.payload.name,
        surname: event.payload.surname,
        idNumber: event.payload.idNumber ?? null,
        phone: event.payload.phone ?? null,
        address: event.payload.address ?? null,
        notes: event.payload.notes ?? null,
        assignedCollectionPointId: event.payload.assignedCollectionPointId ?? null,
      });
    }
    if (event.eventType === "person.profile_updated") {
      const existingPerson = people.find((person) => person.id === event.payload.personId);
      if (existingPerson !== undefined) {
        if (event.payload.updates.name !== undefined) {
          existingPerson.name = event.payload.updates.name;
        }
        if (event.payload.updates.surname !== undefined) {
          existingPerson.surname = event.payload.updates.surname;
        }
        if (event.payload.updates.idNumber !== undefined) {
          existingPerson.idNumber = event.payload.updates.idNumber;
        }
        if (event.payload.updates.phone !== undefined) {
          existingPerson.phone = event.payload.updates.phone;
        }
        if (event.payload.updates.address !== undefined) {
          existingPerson.address = event.payload.updates.address;
        }
        if (event.payload.updates.notes !== undefined) {
          existingPerson.notes = event.payload.updates.notes;
        }
        if (event.payload.updates.assignedCollectionPointId !== undefined) {
          existingPerson.assignedCollectionPointId =
            event.payload.updates.assignedCollectionPointId;
        }
      }
    }
    if (event.eventType === "person.removed") {
      const idx = people.findIndex((person) => person.id === event.payload.personId);
      if (idx !== -1) {
        people.splice(idx, 1);
      }
    }
    if (event.eventType === "material_type.created") {
      materials.push({
        id: event.payload.materialTypeId,
        name: event.payload.name,
        pointsPerKg: event.payload.pointsPerKg,
      });
    }
    if (event.eventType === "item.created") {
      items.push({
        id: event.payload.itemId,
        name: event.payload.name,
        pointsPrice: event.payload.pointsPrice,
        costPrice: event.payload.costPrice ?? null,
        sku: event.payload.sku ?? null,
      });
    }
    if (event.eventType === "collection_point.created") {
      collectionPoints.push({
        id: event.payload.collectionPointId,
        name: event.payload.name,
        isActive: true,
      });
    }
    if (event.eventType === "collection_point.updated") {
      const existingCollectionPoint = collectionPoints.find(
        (collectionPoint) => collectionPoint.id === event.payload.collectionPointId,
      );
      if (existingCollectionPoint !== undefined) {
        if (event.payload.updates.name !== undefined) {
          existingCollectionPoint.name = event.payload.updates.name;
        }
        if (event.payload.updates.isActive !== undefined) {
          existingCollectionPoint.isActive = event.payload.updates.isActive;
        }
      }
    }
    if (event.eventType === "intake.recorded") {
      ledger.push({
        id: event.eventId,
        personId: event.payload.personId,
        deltaPoints: event.payload.totalPoints,
        occurredAt: event.occurredAt,
        sourceEventType: "intake.recorded",
        sourceEventId: event.eventId,
      });
    }
    if (event.eventType === "sale.recorded") {
      ledger.push({
        id: event.eventId,
        personId: event.payload.personId,
        deltaPoints: normalizePointValue(event.payload.totalPoints * -1),
        occurredAt: event.occurredAt,
        sourceEventType: "sale.recorded",
        sourceEventId: event.eventId,
      });
      for (const line of event.payload.lines) {
        if (line.inventoryBatchId === null || line.inventoryBatchId === undefined) {
          continue;
        }
        const batch = inventoryBatches.find(
          (entry) => entry.inventoryBatchId === line.inventoryBatchId,
        );
        if (batch !== undefined) {
          batch.quantities.shop -= line.quantity;
          batch.quantities.sold += line.quantity;
        }
      }
    }
    if (event.eventType === "inventory.status_changed") {
      const batch = inventoryBatches.find(
        (entry) => entry.inventoryBatchId === event.payload.inventoryBatchId,
      );
      if (batch !== undefined) {
        batch.quantities[event.payload.fromStatus] -= event.payload.quantity;
        batch.quantities[event.payload.toStatus] += event.payload.quantity;
      }
    }
    if (event.eventType === "procurement.recorded") {
      procurements.push({
        procurementEventId: event.eventId,
        occurredAt: event.occurredAt,
        supplierName: event.payload.supplierName ?? null,
        tripDistanceKm: event.payload.tripDistanceKm ?? null,
        cashTotal: event.payload.cashTotal,
        lines: event.payload.lines.map((line) => ({
          itemId: line.itemId,
          inventoryBatchId: line.inventoryBatchId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotalCost: line.lineTotalCost,
          unitSellingPrice: line.unitSellingPrice,
          markupPercent: line.markupPercent,
        })),
        isEditable: true,
      });
      for (const line of event.payload.lines) {
        inventoryBatches.push({
          inventoryBatchId: line.inventoryBatchId,
          itemId: line.itemId,
          quantities: {
            storage: line.quantity,
            shop: 0,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        });
      }
      recomputeProcurementEditability();
    }
    if (event.eventType === "procurement.corrected") {
      const procurement = procurements.find(
        (entry) => entry.procurementEventId === event.payload.procurementEventId,
      );
      if (procurement === undefined || !isProcurementEditable(procurement)) {
        return { status: "rejected" as const, reason: "PROCUREMENT_NOT_EDITABLE" };
      }

      const nextLineIds = new Set(event.payload.lines.map((line) => line.inventoryBatchId));
      for (const existingLine of procurement.lines) {
        if (nextLineIds.has(existingLine.inventoryBatchId)) {
          continue;
        }
        const batchIndex = inventoryBatches.findIndex(
          (entry) => entry.inventoryBatchId === existingLine.inventoryBatchId,
        );
        if (batchIndex !== -1) {
          inventoryBatches.splice(batchIndex, 1);
        }
      }

      for (const line of event.payload.lines) {
        const batch = inventoryBatches.find(
          (entry) => entry.inventoryBatchId === line.inventoryBatchId,
        );
        if (batch === undefined) {
          inventoryBatches.push({
            inventoryBatchId: line.inventoryBatchId,
            itemId: line.itemId,
            quantities: {
              storage: line.quantity,
              shop: 0,
              sold: 0,
              spoiled: 0,
              damaged: 0,
              missing: 0,
            },
          });
          continue;
        }
        batch.itemId = line.itemId;
        batch.quantities.storage = line.quantity;
        batch.quantities.shop = 0;
        batch.quantities.sold = 0;
        batch.quantities.spoiled = 0;
        batch.quantities.damaged = 0;
        batch.quantities.missing = 0;
      }

      procurement.occurredAt = event.occurredAt;
      procurement.supplierName = event.payload.supplierName ?? null;
      procurement.tripDistanceKm = event.payload.tripDistanceKm ?? null;
      procurement.cashTotal = event.payload.cashTotal;
      procurement.lines = event.payload.lines.map((line) => ({
        itemId: line.itemId,
        inventoryBatchId: line.inventoryBatchId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineTotalCost: line.lineTotalCost,
        unitSellingPrice: line.unitSellingPrice,
        markupPercent: line.markupPercent,
      }));
      recomputeProcurementEditability();
    }
    return { status: "accepted" as const };
  };

  const listAdjustmentRequests = async (filters: {
    requestType: "points" | "inventory" | null;
    status: "pending" | "approved" | "rejected" | null;
    limit: number;
    cursor: string | null;
  }): Promise<{ requests: AdjustmentRequestRecord[]; nextCursor: string | null }> => {
    const requestedEvents = events.filter(
      (event) =>
        event.eventType === "points.adjustment_requested" ||
        event.eventType === "inventory.adjustment_requested",
    );
    const requests = requestedEvents
      .map((event) => {
        const matchingApplied = events
          .filter(
            (candidate) =>
              (candidate.eventType === "points.adjustment_applied" ||
                candidate.eventType === "inventory.adjustment_applied") &&
              candidate.payload.requestEventId === event.eventId,
          )
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
        const status = matchingApplied === undefined ? "pending" : "approved";
        const requestType =
          event.eventType === "points.adjustment_requested" ? "points" : "inventory";
        return {
          requestEventId: event.eventId,
          requestType,
          status,
          requestedAt: event.occurredAt,
          requestedByUserId: event.actorUserId,
          personId:
            event.eventType === "points.adjustment_requested" ? event.payload.personId : null,
          inventoryBatchId:
            event.eventType === "inventory.adjustment_requested"
              ? event.payload.inventoryBatchId
              : null,
          requestedStatus:
            event.eventType === "inventory.adjustment_requested"
              ? event.payload.requestedStatus
              : null,
          deltaPoints:
            event.eventType === "points.adjustment_requested" ? event.payload.deltaPoints : null,
          quantity:
            event.eventType === "points.adjustment_requested"
              ? Math.abs(event.payload.deltaPoints)
              : event.payload.quantity,
          reason: event.payload.reason,
          notes: event.payload.notes ?? null,
          resolvedByUserId: matchingApplied?.actorUserId ?? null,
          resolvedAt: matchingApplied?.occurredAt ?? null,
          resolutionNotes:
            matchingApplied === undefined
              ? null
              : ((matchingApplied.payload as { notes?: string | null }).notes ?? null),
        } satisfies AdjustmentRequestRecord;
      })
      .filter((request) =>
        filters.requestType === null ? true : request.requestType === filters.requestType,
      )
      .filter((request) => (filters.status === null ? true : request.status === filters.status))
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    const startIndex =
      filters.cursor === null
        ? 0
        : requests.findIndex((request) => request.requestedAt === filters.cursor) + 1;
    const normalizedStart = startIndex < 0 ? 0 : startIndex;
    const page = requests.slice(normalizedStart, normalizedStart + filters.limit);
    const nextCursor =
      normalizedStart + filters.limit >= requests.length
        ? null
        : (page[page.length - 1]?.requestedAt ?? null);
    return {
      requests: page,
      nextCursor,
    };
  };

  return {
    authConfig,
    getStaffUserByUsername: getUserByUsername,
    listPeople: async (search) =>
      people.filter((person) => {
        if (search === undefined || search.trim().length === 0) {
          return true;
        }
        const query = search.toLowerCase();
        return (
          person.name.toLowerCase().includes(query) || person.surname.toLowerCase().includes(query)
        );
      }),
    listMaterials: async () => materials,
    listCollectionPoints: async () => collectionPoints,
    listItems: async () => items,
    listShopBatchesForItem: async (itemId) =>
      inventoryBatches.filter((batch) => batch.itemId === itemId && batch.quantities.shop > 0),
    getPersonById: async (personId) => people.find((person) => person.id === personId) ?? null,
    getMaterialById: async (materialId) =>
      materials.find((material) => material.id === materialId) ?? null,
    getCollectionPointById: async (collectionPointId) =>
      collectionPoints.find((collectionPoint) => collectionPoint.id === collectionPointId) ?? null,
    getItemById: async (itemId) => items.find((item) => item.id === itemId) ?? null,
    getItemByName: async (name) => items.find((item) => item.name === name) ?? null,
    listInventoryBatches: async () => inventoryBatches,
    listInventoryStatusSummary: async () => {
      const statuses: InventoryStatus[] = [
        "storage",
        "shop",
        "sold",
        "spoiled",
        "damaged",
        "missing",
      ];
      return statuses.map((status) => ({
        status,
        totalQuantity: inventoryBatches.reduce((sum, batch) => sum + batch.quantities[status], 0),
      }));
    },
    getInventoryBatchState: async (inventoryBatchId) => {
      const batch = inventoryBatches.find((entry) => entry.inventoryBatchId === inventoryBatchId);
      if (batch === undefined) {
        return null;
      }
      return {
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
      };
    },
    appendEventAndProject,
    appendEvents: async (incomingEvents) => {
      const results: Array<{ status: "accepted" | "duplicate" | "rejected"; reason?: string }> = [];
      for (const event of incomingEvents) {
        const duplicate = events.some((existing) => existing.eventId === event.eventId);
        if (duplicate) {
          results.push({ status: "duplicate" });
        } else {
          await appendEventAndProject(event);
          results.push({ status: "accepted" });
        }
      }
      return results;
    },
    listSyncConflicts: async (status, limit, cursor) => {
      const filtered = conflicts
        .filter((conflict) => (status === "open" ? !conflict.resolved : true))
        .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
      const startIndex =
        cursor === null
          ? 0
          : filtered.findIndex((conflict) => conflict.detectedEventId === cursor) + 1;
      const normalizedStart = startIndex < 0 ? 0 : startIndex;
      const page = filtered.slice(normalizedStart, normalizedStart + limit);
      const nextCursor =
        normalizedStart + limit >= filtered.length
          ? null
          : (page[page.length - 1]?.detectedEventId ?? null);
      return {
        conflicts: page,
        nextCursor,
      };
    },
    resolveSyncConflict: async (conflictId, request, actor) => {
      const target = conflicts.find((conflict) => conflict.conflictId === conflictId);
      if (target === undefined) {
        return { ok: false as const, error: "CONFLICT_NOT_FOUND" as const };
      }
      if (target.resolved) {
        return { ok: false as const, error: "ALREADY_RESOLVED" as const };
      }
      const typedRequest: SyncResolveConflictRequest = request;
      target.resolved = true;
      target.resolvedAt = baseNow.toISOString();
      target.resolution = typedRequest.resolution;
      target.resolutionEventId = "event-resolve-new";
      target.resolutionNotes = typedRequest.notes;
      target.resolvedByUserId = actor.id;
      return {
        ok: true as const,
        value: {
          conflictId,
          resolutionEventId: "event-resolve-new",
        },
      };
    },
    listSyncAuditReport: async (limit, cursor) => {
      const startIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      const normalized = Number.isFinite(startIndex) ? startIndex : 0;
      const page = auditIssues.slice(normalized, normalized + limit);
      const nextCursor =
        normalized + limit >= auditIssues.length ? null : String(normalized + page.length);
      return {
        generatedAt: baseNow.toISOString(),
        totalIssues: auditIssues.length,
        errorCount: auditIssues.filter((issue) => issue.severity === "error").length,
        warningCount: auditIssues.filter((issue) => issue.severity === "warning").length,
        issues: page,
        nextCursor,
      };
    },
    getSyncAuditEvent: async (eventId) => {
      const found = events.find((event) => event.eventId === eventId);
      if (found === undefined) {
        return null;
      }
      return {
        event: found,
        linkedConflictIds: ["conflict-open"],
        linkedResolutionEventIds: [],
      };
    },
    listSyncReconciliationReport: async (limit, cursor, code, repairableOnly) => {
      const filtered = reconciliationIssues
        .filter((issue) => (code === null ? true : issue.code === code))
        .filter((issue) => (repairableOnly ? issue.suggestedRepair !== null : true));
      const startIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      const normalized = Number.isFinite(startIndex) ? startIndex : 0;
      const page = filtered.slice(normalized, normalized + limit);
      const nextCursor =
        normalized + limit >= filtered.length ? null : String(normalized + page.length);
      return {
        generatedAt: baseNow.toISOString(),
        summary: {
          totalIssues: filtered.length,
          errorCount: filtered.filter((issue) => issue.severity === "error").length,
          warningCount: filtered.filter((issue) => issue.severity === "warning").length,
          repairableCount: filtered.filter((issue) => issue.suggestedRepair !== null).length,
        },
        issues: page,
        nextCursor,
      };
    },
    repairSyncReconciliationIssue: async (issueId, notes) => {
      if (notes.trim().length === 0) {
        return { ok: false as const, error: "BAD_REQUEST" as const };
      }
      const issue = reconciliationIssues.find((entry) => entry.issueId === issueId);
      if (issue === undefined || issue.suggestedRepair === null) {
        return { ok: false as const, error: "NOT_FOUND" as const };
      }
      const repair = issue.suggestedRepair;
      if (repair === undefined || repair === null) {
        return { ok: false as const, error: "NOT_FOUND" as const };
      }
      if (repair.repairKind === "projection_rebuild") {
        return {
          ok: true as const,
          value: {
            issueId,
            repairKind: "projection_rebuild" as const,
            rebuiltAt: baseNow.toISOString(),
          },
        };
      }
      return {
        ok: true as const,
        value: {
          issueId,
          repairKind: repair.repairKind,
          repairEventId: "reconciliation-repair-event",
        },
      };
    },
    getLedgerBalance: async (personId) => {
      const total = ledger
        .filter((entry) => entry.personId === personId)
        .reduce((sum, entry) => sumPointValues([sum, entry.deltaPoints]), 0);
      return {
        personId,
        balancePoints: total,
      };
    },
    listLedgerEntries: async (personId) => ledger.filter((entry) => entry.personId === personId),
    getLivePointsBalance: async (personId) =>
      ledger
        .filter((entry) => entry.personId === personId)
        .reduce((sum, entry) => sumPointValues([sum, entry.deltaPoints]), 0),
    listMaterialsCollectedReport: async (filters) =>
      materialsReportRows.filter((row) => {
        const inFrom = filters.fromDate === null || row.day >= filters.fromDate;
        const inTo = filters.toDate === null || row.day <= filters.toDate;
        const inMaterial =
          filters.materialTypeId === null || row.materialTypeId === filters.materialTypeId;
        const inLocation =
          filters.locationText === null ||
          row.locationText.toLowerCase().includes(filters.locationText.toLowerCase());
        return inFrom && inTo && inMaterial && inLocation;
      }),
    listPointsLiabilityReport: async (filters) => {
      const rows = pointsLiabilityReportRows
        .filter((row) => row.balancePoints > 0)
        .filter((row) => {
          if (filters.search === null) {
            return true;
          }
          const query = filters.search.toLowerCase();
          return (
            row.name.toLowerCase().includes(query) || row.surname.toLowerCase().includes(query)
          );
        })
        .sort((left, right) => {
          if (left.balancePoints !== right.balancePoints) {
            return right.balancePoints - left.balancePoints;
          }
          if (left.surname !== right.surname) {
            return left.surname.localeCompare(right.surname);
          }
          if (left.name !== right.name) {
            return left.name.localeCompare(right.name);
          }
          return left.personId.localeCompare(right.personId);
        });
      return {
        rows,
        summary: {
          totalOutstandingPoints: rows.reduce(
            (sum, row) => sumPointValues([sum, row.balancePoints]),
            0,
          ),
          personCount: rows.length,
        },
      };
    },
    listCashflowReport: async (filters) => {
      const rows = cashflowReportRows.filter((row) => {
        const inFrom = filters.fromDate === null || row.day >= filters.fromDate;
        const inTo = filters.toDate === null || row.day <= filters.toDate;
        if (filters.locationText === null) {
          return inFrom && inTo;
        }
        return inFrom && inTo && filters.locationText.toLowerCase().includes("village");
      });
      const expenseCategories =
        filters.locationText === null
          ? cashflowExpenseCategories
          : cashflowExpenseCategories.filter((row) => row.category === "Fuel");
      return {
        rows,
        summary: {
          totalSalesPointsValue: rows.reduce(
            (sum, row) => sumPointValues([sum, row.salesPointsValue]),
            0,
          ),
          totalExpenseCash: rows.reduce((sum, row) => sum + row.expenseCashTotal, 0),
          netCashflow: Number(
            (
              rows.reduce((sum, row) => sumPointValues([sum, row.salesPointsValue]), 0) -
              rows.reduce((sum, row) => sum + row.expenseCashTotal, 0)
            ).toFixed(2),
          ),
          saleCount: rows.reduce((sum, row) => sum + row.saleCount, 0),
          expenseCount: rows.reduce((sum, row) => sum + row.expenseCount, 0),
        },
        expenseCategories,
      };
    },
    listInventoryStatusReport: async () => inventoryStatusReport,
    listInventoryStatusLogReport: async (filters) =>
      inventoryStatusLogReportRows.filter((row) => {
        const occurredDate = row.occurredAt.slice(0, 10);
        const inFrom = filters.fromDate === null || occurredDate >= filters.fromDate;
        const inTo = filters.toDate === null || occurredDate <= filters.toDate;
        const inFromStatus = filters.fromStatus === null || row.fromStatus === filters.fromStatus;
        const inToStatus = filters.toStatus === null || row.toStatus === filters.toStatus;
        return inFrom && inTo && inFromStatus && inToStatus;
      }),
    listProcurements: async () => {
      recomputeProcurementEditability();
      return procurements
        .slice()
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    },
    listSalesReport: async (filters) => {
      const rows = salesReportRows.filter((row) => {
        const inFrom = filters.fromDate === null || row.day >= filters.fromDate;
        const inTo = filters.toDate === null || row.day <= filters.toDate;
        const inLocation =
          filters.locationText === null ||
          row.locationText.toLowerCase().includes(filters.locationText.toLowerCase());
        const inItem = filters.itemId === null || row.itemId === filters.itemId;
        return inFrom && inTo && inLocation && inItem;
      });
      return {
        rows,
        summary: {
          totalQuantity: rows.reduce((sum, row) => sum + row.totalQuantity, 0),
          totalPoints: rows.reduce((sum, row) => sumPointValues([sum, row.totalPoints]), 0),
          saleCount: rows.reduce((sum, row) => sum + row.saleCount, 0),
        },
      };
    },
    listAdjustmentRequests,
    listStaffUsers: async () =>
      staffUsers.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
      })),
    createStaffUser: async (input) => {
      const duplicate = staffUsers.some((user) => user.username === input.username);
      if (duplicate) {
        return { ok: false as const, error: "CONFLICT" as const };
      }
      staffUsers.push({
        id: input.id,
        username: input.username,
        role: input.role,
        passcodeHash: input.passcodeHash,
      });
      return {
        ok: true as const,
        value: {
          id: input.id,
          username: input.username,
          role: input.role,
        },
      };
    },
    updateStaffUser: async (userId, input) => {
      const user = staffUsers.find((entry) => entry.id === userId);
      if (user === undefined) {
        return { ok: false as const, error: "NOT_FOUND" as const };
      }
      if (input.username !== undefined) {
        const duplicate = staffUsers.some(
          (entry) => entry.id !== userId && entry.username === input.username,
        );
        if (duplicate) {
          return { ok: false as const, error: "CONFLICT" as const };
        }
        user.username = input.username;
      }
      if (input.role !== undefined) {
        user.role = input.role;
      }
      if (input.passcodeHash !== undefined) {
        user.passcodeHash = input.passcodeHash;
      }
      return {
        ok: true as const,
        value: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      };
    },
    pullEvents: async (cursor, limit) => {
      const startIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      const normalizedStart = Number.isFinite(startIndex) ? startIndex : 0;
      const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
      const slice = events.slice(normalizedStart, normalizedStart + normalizedLimit);
      const nextCursor = `${normalizedStart + slice.length}`;
      return {
        events: slice,
        nextCursor,
      };
    },
    getSyncStatus: async () => ({
      latestCursor: `${events.length}`,
      projectionRefreshedAt: baseNow.toISOString(),
      projectionCursor: `${events.length}`,
    }),
    now: () => baseNow,
  };
};

const loginAndGetToken = async (
  server: ReturnType<typeof createApiServer>,
  username: string,
  passcode: string,
) => {
  const login = await supertest(server).post("/auth/login").send({
    username,
    passcode,
  });
  return login.body.token as string;
};

describe("core HTTP endpoints", () => {
  test("GET /people returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server).get("/people");
    expect(response.status).toBe(401);
  });

  test("GET /people allows user, operator, and manager and masks sensitive fields", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const collectorResponse = await supertest(server)
      .get("/people")
      .set("authorization", `Bearer ${collectorToken}`);
    const operatorResponse = await supertest(server)
      .get("/people")
      .set("authorization", `Bearer ${operatorToken}`);
    const managerResponse = await supertest(server)
      .get("/people")
      .set("authorization", `Bearer ${managerToken}`);

    for (const response of [collectorResponse, operatorResponse, managerResponse]) {
      expect(response.status).toBe(200);
      expect(response.body.people[0]?.idNumber).toBe("****87");
      expect(response.body.people[0]?.phone).toBe("****67");
    }
  });

  test("GET /people?search is case-insensitive and matches partial name or surname", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    // uppercase partial name match
    const upperResponse = await supertest(server)
      .get("/people?search=ALI")
      .set("authorization", `Bearer ${token}`);
    expect(upperResponse.status).toBe(200);
    expect(upperResponse.body.people.length).toBeGreaterThan(0);

    // lowercase same search returns same results
    const lowerResponse = await supertest(server)
      .get("/people?search=ali")
      .set("authorization", `Bearer ${token}`);
    expect(lowerResponse.status).toBe(200);
    const lowerNames = (lowerResponse.body as { people: { name: string }[] }).people.map(
      (p) => p.name,
    );
    const upperNames = (upperResponse.body as { people: { name: string }[] }).people.map(
      (p) => p.name,
    );
    expect(lowerNames).toEqual(upperNames);

    // partial surname match
    const surnameResponse = await supertest(server)
      .get("/people?search=ZUL")
      .set("authorization", `Bearer ${token}`);
    expect(surnameResponse.status).toBe(200);
    expect(surnameResponse.body.people.length).toBeGreaterThan(0);
  });

  test("GET /people includes balancePoints for each person", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);
    const response = await supertest(server).get("/people").set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(typeof (response.body.people as PersonRecord[])[0]?.balancePoints).toBe("number");
  });

  test("POST /people allows user", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Jane",
        surname: "Doe",
        idNumber: "8001015009087",
        phone: "0821234567",
      });

    expect(response.status).toBe(201);
    expect(response.body.person.name).toBe("Jane");
    expect(response.body.person.idNumber).toBe("****87");
    expect(response.body.person.phone).toBe("****67");
  });

  test("POST /people accepts an assigned collection point and returns it", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe", assignedCollectionPointId: "cp-1" });

    expect(response.status).toBe(201);
    expect(response.body.person.assignedCollectionPointId).toBe("cp-1");
  });

  test("POST /people allows assigning an inactive collection point", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe", assignedCollectionPointId: "cp-2" });

    expect(response.status).toBe(201);
    expect(response.body.person.assignedCollectionPointId).toBe("cp-2");
  });

  test("POST /people returns 404 when assignedCollectionPointId does not exist", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe", assignedCollectionPointId: "does-not-exist" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COLLECTION_POINT_NOT_FOUND");
  });

  test("POST /people defaults assignedCollectionPointId to null when omitted", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe" });

    expect(response.status).toBe(201);
    expect(response.body.person.assignedCollectionPointId).toBeNull();
  });

  test("POST /people keeps null sensitive fields as null in responses", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe" });

    expect(response.status).toBe(201);
    expect(response.body.person.idNumber).toBeNull();
    expect(response.body.person.phone).toBeNull();
  });

  test("PATCH /people/:personId returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server)
      .patch("/people/person-a")
      .send({
        updates: {
          notes: "new note",
        },
      });
    expect(response.status).toBe(401);
  });

  test("PATCH /people/:personId allows user and manager", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const collectorResponse = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({
        updates: {
          notes: "new note",
        },
      });
    expect(collectorResponse.status).toBe(200);
    expect(collectorResponse.body.person.id).toBe("person-a");
    expect(collectorResponse.body.person.notes).toBe("new note");

    const allowed = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          phone: "0123456789",
        },
      });
    expect(allowed.status).toBe(200);
    expect(allowed.body.person.id).toBe("person-a");
    expect(allowed.body.person.phone).toBe("****89");
  });

  test("PATCH /people/:personId reassigns the collection point", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: "cp-1" } });

    expect(response.status).toBe(200);
    expect(response.body.person.assignedCollectionPointId).toBe("cp-1");
  });

  test("PATCH /people/:personId allows reassigning to an inactive collection point", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: "cp-2" } });

    expect(response.status).toBe(200);
    expect(response.body.person.assignedCollectionPointId).toBe("cp-2");
  });

  test("PATCH /people/:personId returns 404 when assignedCollectionPointId does not exist", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: "does-not-exist" } });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COLLECTION_POINT_NOT_FOUND");
  });

  test("PATCH /people/:personId can clear the assigned collection point", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const assign = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: "cp-1" } });
    expect(assign.body.person.assignedCollectionPointId).toBe("cp-1");

    const clear = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: null } });
    expect(clear.status).toBe(200);
    expect(clear.body.person.assignedCollectionPointId).toBeNull();
  });

  test("deactivating a collection point does not clear existing person assignments", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const assign = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { assignedCollectionPointId: "cp-1" } });
    expect(assign.body.person.assignedCollectionPointId).toBe("cp-1");

    const deactivate = await supertest(server)
      .patch("/collection-points/cp-1")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { isActive: false } });
    expect(deactivate.body.collectionPoint.isActive).toBe(false);

    const peopleResponse = await supertest(server)
      .get("/people")
      .set("authorization", `Bearer ${managerToken}`);
    const personA = (peopleResponse.body.people as PersonRecord[]).find(
      (person) => person.id === "person-a",
    );
    expect(personA?.assignedCollectionPointId).toBe("cp-1");
  });

  test("PATCH /people/:personId returns 404 for unknown person", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);
    const response = await supertest(server)
      .patch("/people/person-missing")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          phone: "012345",
        },
      });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("PERSON_NOT_FOUND");
  });

  test("PATCH /people/:personId returns 400 for invalid payload", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const emptyUpdate = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {},
      });
    expect(emptyUpdate.status).toBe(400);

    const unknownField = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          email: "x@y.z",
        },
      });
    expect(unknownField.status).toBe(400);
  });

  test("POST /people/:personId/remove returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server)
      .post("/people/person-a/remove")
      .send({ reason: "test reason" });
    expect(response.status).toBe(401);
  });

  test("POST /people/:personId/remove returns 403 for user role", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const response = await supertest(server)
      .post("/people/person-a/remove")
      .set("authorization", `Bearer ${token}`)
      .send({ reason: "test reason" });
    expect(response.status).toBe(403);
  });

  test("POST /people/:personId/remove returns 404 for unknown person", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);
    const response = await supertest(server)
      .post("/people/person-missing/remove")
      .set("authorization", `Bearer ${token}`)
      .send({ reason: "gone" });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("PERSON_NOT_FOUND");
  });

  test("POST /people/:personId/remove returns 409 when person has a points balance", async () => {
    const deps = createDependencies();
    const server = createApiServer(deps);
    const adminToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    await supertest(server)
      .post("/intake")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 2, pointsPerKg: 3, pointsAwarded: 6 }],
        totalPoints: 6,
      });

    const response = await supertest(server)
      .post("/people/person-a/remove")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ reason: "no longer member" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("PERSON_HAS_POINTS_BALANCE");
  });

  test("POST /people/:personId/remove returns 400 when reason is missing or empty", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const created = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Zero", surname: "Balance" });
    const newPersonId: string = created.body.person.id as string;

    const noReason = await supertest(server)
      .post(`/people/${newPersonId}/remove`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(noReason.status).toBe(400);

    const emptyReason = await supertest(server)
      .post(`/people/${newPersonId}/remove`)
      .set("authorization", `Bearer ${token}`)
      .send({ reason: "   " });
    expect(emptyReason.status).toBe(400);
  });

  test("POST /people/:personId/remove succeeds for admin when person has zero balance", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const created = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Zero", surname: "Balance" });
    const newPersonId: string = created.body.person.id as string;

    const response = await supertest(server)
      .post(`/people/${newPersonId}/remove`)
      .set("authorization", `Bearer ${token}`)
      .send({ reason: "left the community" });

    expect(response.status).toBe(200);
    expect(response.body.personId).toBe(newPersonId);

    const peopleResponse = await supertest(server)
      .get("/people")
      .set("authorization", `Bearer ${token}`);
    expect(peopleResponse.status).toBe(200);
    const ids = (peopleResponse.body.people as PersonRecord[]).map((p) => p.id);
    expect(ids).not.toContain(newPersonId);
  });

  test("POST /materials rejects collector and allows manager", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const denied = await supertest(server)
      .post("/materials")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({ name: "PET", pointsPerKg: 2.3 });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/materials")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "PET", pointsPerKg: 2.3 });
    expect(allowed.status).toBe(201);
    expect(allowed.body.material.name).toBe("PET");
  });

  test("GET /collection-points is available to both collector and manager roles", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const asCollector = await supertest(server)
      .get("/collection-points")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(asCollector.status).toBe(200);
    expect(asCollector.body.collectionPoints).toEqual([
      { id: "cp-1", name: "Heuwelkroon parkie", isActive: true },
      { id: "cp-2", name: "Old Village Point", isActive: false },
    ]);

    const asManager = await supertest(server)
      .get("/collection-points")
      .set("authorization", `Bearer ${managerToken}`);
    expect(asManager.status).toBe(200);
  });

  test("GET /collection-points returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server).get("/collection-points");
    expect(response.status).toBe(401);
  });

  test("POST /collection-points rejects collector and allows manager", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const denied = await supertest(server)
      .post("/collection-points")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({ name: "Village B" });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/collection-points")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "Village B" });
    expect(allowed.status).toBe(201);
    expect(allowed.body.collectionPoint.name).toBe("Village B");
    expect(allowed.body.collectionPoint.isActive).toBe(true);
  });

  test("POST /collection-points rejects a request with a blank name", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .post("/collection-points")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "   " });
    expect(response.status).toBe(400);
  });

  test("PATCH /collection-points/:id rejects collector and allows manager to deactivate", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const denied = await supertest(server)
      .patch("/collection-points/cp-1")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({ updates: { isActive: false } });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .patch("/collection-points/cp-1")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { isActive: false } });
    expect(allowed.status).toBe(200);
    expect(allowed.body.collectionPoint.isActive).toBe(false);
    expect(allowed.body.collectionPoint.name).toBe("Heuwelkroon parkie");
  });

  test("PATCH /collection-points/:id returns 404 for an unknown collection point", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .patch("/collection-points/does-not-exist")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: { isActive: false } });
    expect(response.status).toBe(404);
  });

  test("PATCH /collection-points/:id rejects a request with no update fields", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .patch("/collection-points/cp-1")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ updates: {} });
    expect(response.status).toBe(400);
  });

  test("POST /items rejects shop operator and allows manager", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const denied = await supertest(server)
      .post("/items")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({ name: "Soap", pointsPrice: 15.4 });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/items")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "Soap", pointsPrice: 15.4 });
    expect(allowed.status).toBe(201);
    expect(allowed.body.item.name).toBe("Soap");
  });

  test("POST /intakes calculates floored tenths points and credits ledger", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 2.9 }],
      });

    expect(intake.status).toBe(201);
    expect(intake.body.totalPoints).toBe(9.2);

    const balance = await supertest(server)
      .get("/ledger/person-a/balance")
      .set("authorization", `Bearer ${token}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance.balancePoints).toBe(39.5);
  });

  test("POST /intakes accepts the old shape with no collectionPointId and persists it as null", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 1 }],
      });
    expect(intake.status).toBe(201);

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=50")
      .set("authorization", `Bearer ${token}`);
    const pulled = (
      pull.body.events as Array<{ eventType: string; payload: { collectionPointId?: unknown } }>
    ).find((event) => event.eventType === "intake.recorded");
    expect(pulled?.payload.collectionPointId).toBeNull();
  });

  test("POST /intakes accepts a collectionPointId and persists it on the intake.recorded event", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 1 }],
        collectionPointId: "cp-1",
      });
    expect(intake.status).toBe(201);

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=50")
      .set("authorization", `Bearer ${token}`);
    const pulled = (
      pull.body.events as Array<{ eventType: string; payload: { collectionPointId?: unknown } }>
    ).find((event) => event.eventType === "intake.recorded");
    expect(pulled?.payload.collectionPointId).toBe("cp-1");
  });

  test("POST /intakes returns 404 when collectionPointId does not exist", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 1 }],
        collectionPointId: "does-not-exist",
      });
    expect(intake.status).toBe(404);
    expect(intake.body.error).toBe("COLLECTION_POINT_NOT_FOUND");
  });

  test("POST /sales blocks insufficient points", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);
    const administratorToken = await loginAndGetToken(
      server,
      "administrator",
      administratorPasscode,
    );
    const stockMove = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 10,
        reason: "stock for sales",
      });
    expect(stockMove.status).toBe(201);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 9 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_POINTS");
    expect(response.body.balancePoints).toBe(30.3);
    expect(response.body.requestedPoints).toBe(94.5);

    const balance = await supertest(server)
      .get("/ledger/person-a/balance")
      .set("authorization", `Bearer ${token}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance.balancePoints).toBe(30.3);
  });

  test("POST /sales allocates FIFO batches when inventoryBatchId is omitted", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 4,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
        {
          inventoryBatchId: "batch-2",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 5,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);
    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 30 }],
      });
    expect(intake.status).toBe(201);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 7 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.totalPoints).toBe(73.5);

    const summary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${token}`);
    expect(summary.status).toBe(200);
    const rows = summary.body.summary as InventoryStatusSummaryRecord[];
    const shop = rows.find((entry) => entry.status === "shop");
    const sold = rows.find((entry) => entry.status === "sold");
    expect(shop?.totalQuantity).toBe(2);
    expect(sold?.totalQuantity).toBe(7);
  });

  test("POST /sales accepts the old shape with no collectionPointId and persists it as null", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: { storage: 0, shop: 5, sold: 0, spoiled: 0, damaged: 0, missing: 0 },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "user", userPasscode);

    const sale = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({ personId: "person-a", lines: [{ itemId: "item-1", quantity: 1 }] });
    expect(sale.status).toBe(201);

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=50")
      .set("authorization", `Bearer ${token}`);
    const pulled = (
      pull.body.events as Array<{ eventType: string; payload: { collectionPointId?: unknown } }>
    ).find((event) => event.eventType === "sale.recorded");
    expect(pulled?.payload.collectionPointId).toBeNull();
  });

  test("POST /sales accepts a collectionPointId and persists it on the sale.recorded event", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: { storage: 0, shop: 5, sold: 0, spoiled: 0, damaged: 0, missing: 0 },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "user", userPasscode);

    const sale = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 1 }],
        collectionPointId: "cp-1",
      });
    expect(sale.status).toBe(201);

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=50")
      .set("authorization", `Bearer ${token}`);
    const pulled = (
      pull.body.events as Array<{ eventType: string; payload: { collectionPointId?: unknown } }>
    ).find((event) => event.eventType === "sale.recorded");
    expect(pulled?.payload.collectionPointId).toBe("cp-1");
  });

  test("POST /sales returns 404 when collectionPointId does not exist", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: { storage: 0, shop: 5, sold: 0, spoiled: 0, damaged: 0, missing: 0 },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "user", userPasscode);

    const sale = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 1 }],
        collectionPointId: "does-not-exist",
      });
    expect(sale.status).toBe(404);
    expect(sale.body.error).toBe("COLLECTION_POINT_NOT_FOUND");
  });

  test("POST /sales rejects when explicit batch does not belong to line item", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-2",
          quantities: {
            storage: 0,
            shop: 4,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", inventoryBatchId: "batch-1", quantity: 1 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INVENTORY_BATCH_ITEM_MISMATCH");
  });

  test("POST /sales rejects insufficient stock with deterministic details", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 2,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 3 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_STOCK");
    expect(response.body.itemId).toBe("item-1");
    expect(response.body.requiredQuantity).toBe(3);
    expect(response.body.availableQuantity).toBe(2);
  });

  test("POST /procurements enforces manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3 }],
      });

    expect(response.status).toBe(403);
  });

  test("POST /procurements validates payload and unknown items", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const badPayload = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-11T00:00:00.000Z",
        lines: [{ itemId: "item-1", quantity: 0, unitCost: 3, markupPercent: 0 }],
      });
    expect(badPayload.status).toBe(400);

    const missingItem = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-11T00:00:00.000Z",
        lines: [{ itemId: "item-missing", quantity: 2, unitCost: 3, markupPercent: 0 }],
      });
    expect(missingItem.status).toBe(404);
    expect(missingItem.body.error).toBe("ITEM_NOT_FOUND");
  });

  test("POST /procurements appends event, stores occurredAt, and increases storage inventory", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const beforeSummary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${managerToken}`);
    expect(beforeSummary.status).toBe(200);

    const response = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-10T00:00:00.000Z",
        supplierName: "Village Supplier",
        tripDistanceKm: 12,
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3, markupPercent: 15 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.eventId).toBeDefined();
    expect(response.body.cashTotal).toBe(6);
    expect(response.body.lines).toHaveLength(1);
    expect(response.body.lines[0]?.lineTotalCost).toBe(6);
    expect(response.body.lines[0]?.markupPercent).toBe(15);
    expect(typeof response.body.lines[0]?.inventoryBatchId).toBe("string");

    const afterSummary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${managerToken}`);
    expect(afterSummary.status).toBe(200);
    const rows = afterSummary.body.summary as InventoryStatusSummaryRecord[];
    const storage = rows.find((entry) => entry.status === "storage");
    expect(storage?.totalQuantity).toBe(12);
  });

  test("POST /procurements computes unitSellingPrice from unitCost and markupPercent", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    // unitCost=3, markupPercent=20 → 3 * 1.2 = 3.6 → roundUpToNearest10Cents → 3.6
    const response = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-10T00:00:00.000Z",
        supplierName: "Supplier",
        tripDistanceKm: null,
        lines: [{ itemId: "item-1", quantity: 1, unitCost: 3, markupPercent: 20 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.lines[0]?.unitSellingPrice).toBe(3.6);

    // unitCost=3, markupPercent=25 → 3 * 1.25 = 3.75 → roundUpToNearest10Cents → 3.8
    const response2 = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-10T00:00:00.000Z",
        supplierName: "Supplier",
        tripDistanceKm: null,
        lines: [{ itemId: "item-1", quantity: 1, unitCost: 3, markupPercent: 25 }],
      });

    expect(response2.status).toBe(201);
    expect(response2.body.lines[0]?.unitSellingPrice).toBe(3.8);
  });

  test("GET /procurements lists effective procurements with editability", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const created = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-09T00:00:00.000Z",
        supplierName: "Village Supplier",
        tripDistanceKm: 10,
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3, markupPercent: 20 }],
      });

    expect(created.status).toBe(201);
    const createdBody: unknown = created.body;
    const createdProcurement = createdBody as {
      eventId: string;
    };

    const response = await supertest(server)
      .get("/procurements")
      .set("authorization", `Bearer ${managerToken}`);

    const responseBody: unknown = response.body;
    const procurements = (responseBody as { procurements: ProcurementRecord[] }).procurements;

    expect(response.status).toBe(200);
    expect(procurements).toHaveLength(1);
    expect(procurements[0]).toMatchObject({
      procurementEventId: createdProcurement.eventId,
      occurredAt: "2026-06-09T00:00:00.000Z",
      supplierName: "Village Supplier",
      tripDistanceKm: 10,
      cashTotal: 6,
      isEditable: true,
    });
    expect(procurements[0]?.lines[0]?.markupPercent).toBe(20);
  });

  test("POST /procurements/:eventId/corrections updates untouched procurement", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const created = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-09T00:00:00.000Z",
        supplierName: "Village Supplier",
        tripDistanceKm: 10,
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3, markupPercent: 20 }],
      });

    expect(created.status).toBe(201);
    const createdBody: unknown = created.body;
    const createdProcurement = createdBody as {
      eventId: string;
      lines: Array<{
        inventoryBatchId: string;
      }>;
    };
    const firstCreatedLine = createdProcurement.lines[0];
    expect(firstCreatedLine).toBeDefined();
    const originalBatchId = firstCreatedLine!.inventoryBatchId;

    const corrected = await supertest(server)
      .post(`/procurements/${createdProcurement.eventId}/corrections`)
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-11T00:00:00.000Z",
        supplierName: "Village Supplier Updated",
        tripDistanceKm: 14,
        reason: "user edit",
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: originalBatchId,
            quantity: 3,
            unitCost: 4,
            markupPercent: 25,
          },
        ],
      });

    expect(corrected.status).toBe(201);
    expect(corrected.body.cashTotal).toBe(12);
    expect(corrected.body.lines[0]?.markupPercent).toBe(25);

    const listResponse = await supertest(server)
      .get("/procurements")
      .set("authorization", `Bearer ${managerToken}`);
    const listResponseBody: unknown = listResponse.body;
    const listedProcurements = (listResponseBody as { procurements: ProcurementRecord[] })
      .procurements;

    expect(listResponse.status).toBe(200);
    expect(listedProcurements[0]).toMatchObject({
      procurementEventId: createdProcurement.eventId,
      occurredAt: "2026-06-11T00:00:00.000Z",
      supplierName: "Village Supplier Updated",
      tripDistanceKm: 14,
      cashTotal: 12,
      isEditable: true,
    });
    expect(listedProcurements[0]?.lines[0]).toMatchObject({
      inventoryBatchId: originalBatchId,
      quantity: 3,
      unitCost: 4,
      lineTotalCost: 12,
      markupPercent: 25,
    });
  });

  test("POST /procurements/:eventId/corrections rejects locked procurement", async () => {
    const dependencies = createDependencies();
    const server = createApiServer(dependencies);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const created = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-09T00:00:00.000Z",
        supplierName: "Village Supplier",
        tripDistanceKm: 10,
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3, markupPercent: 20 }],
      });

    expect(created.status).toBe(201);
    const originalBatchId = created.body.lines[0]?.inventoryBatchId as string;

    const moveToShop = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        inventoryBatchId: originalBatchId,
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 1,
        reason: "Move to shop",
      });
    expect(moveToShop.status).toBe(201);

    const corrected = await supertest(server)
      .post(`/procurements/${created.body.eventId as string}/corrections`)
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        occurredAt: "2026-06-11T00:00:00.000Z",
        supplierName: "Village Supplier Updated",
        tripDistanceKm: 14,
        reason: "user edit",
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: originalBatchId,
            quantity: 3,
            unitCost: 4,
            markupPercent: 25,
          },
        ],
      });

    expect(corrected.status).toBe(409);
    expect(corrected.body.error).toBe("PROCUREMENT_NOT_EDITABLE");
  });

  test("POST /procurements/bulk enforces manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/procurements/bulk")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        supplierName: "Makro Online",
        tripDistanceKm: 0,
        rows: [{ productName: "Soap", quantity: 2, lineTotalCost: 6 }],
      });

    expect(response.status).toBe(403);
  });

  test("POST /procurements/bulk validates row shape, totals, and product resolution", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const badQuantity = await supertest(server)
      .post("/procurements/bulk")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        supplierName: "Makro Online",
        tripDistanceKm: 0,
        rows: [{ productName: "Soap", quantity: 0, lineTotalCost: 6 }],
      });
    expect(badQuantity.status).toBe(400);
    expect(badQuantity.body.error).toBe("BAD_REQUEST");

    const missingTotal = await supertest(server)
      .post("/procurements/bulk")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        supplierName: "Makro Online",
        tripDistanceKm: 0,
        rows: [{ productName: "Soap", quantity: 2 }],
      });
    expect(missingTotal.status).toBe(400);
    expect(missingTotal.body.error).toBe("BAD_REQUEST");

    const missingItem = await supertest(server)
      .post("/procurements/bulk")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        supplierName: "Makro Online",
        tripDistanceKm: 0,
        rows: [{ productName: "Missing", quantity: 2, lineTotalCost: 6 }],
      });
    expect(missingItem.status).toBe(400);
    expect(missingItem.body.error).toBe("ITEM_NOT_FOUND");
    expect(missingItem.body.rows).toEqual([{ index: 0, productName: "Missing" }]);
  });

  test("POST /procurements/bulk resolves names and appends one standard procurement event", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .post("/procurements/bulk")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        supplierName: "Makro Online",
        tripDistanceKm: 0,
        rows: [
          { productName: "Soap", quantity: 2, lineTotalCost: 6 },
          { productName: "Soap", quantity: 1, lineTotalCost: 4.5 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.eventId).toBeDefined();
    expect(response.body.cashTotal).toBe(10.5);
    expect(response.body.lines).toHaveLength(2);
    expect(response.body.lines[0]).toMatchObject({
      itemId: "item-1",
      quantity: 2,
      unitCost: 3,
      lineTotalCost: 6,
    });
    expect(response.body.lines[1]).toMatchObject({
      itemId: "item-1",
      quantity: 1,
      unitCost: 4.5,
      lineTotalCost: 4.5,
    });
    expect(typeof response.body.lines[0]?.inventoryBatchId).toBe("string");
    expect(typeof response.body.lines[1]?.inventoryBatchId).toBe("string");
  });

  test("POST /expenses requires authorization and manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);

    const unauthorized = await supertest(server).post("/expenses").send({
      category: "Fuel",
      cashAmount: 10,
    });
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        category: "Fuel",
        cashAmount: 10,
      });
    expect(forbidden.status).toBe(403);
  });

  test("POST /expenses validates payload", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const missingCategory = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        cashAmount: 10,
      });
    expect(missingCategory.status).toBe(400);
    expect(missingCategory.body.error).toBe("BAD_REQUEST");

    const invalidAmount = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: "10",
      });
    expect(invalidAmount.status).toBe(400);
    expect(invalidAmount.body.error).toBe("BAD_REQUEST");

    const negativeAmount = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: -1,
      });
    expect(negativeAmount.status).toBe(400);
    expect(negativeAmount.body.error).toBe("BAD_REQUEST");
  });

  test("POST /expenses appends expense.recorded event", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: 99.5,
        notes: "Round trip collection",
        receiptRef: "RCPT-1",
      });

    expect(response.status).toBe(201);
    expect(response.body.eventId).toBeDefined();
    expect(response.body.expense.category).toBe("Fuel");
    expect(response.body.expense.cashAmount).toBe(99.5);
    expect(response.body.expense.notes).toBe("Round trip collection");
    expect(response.body.expense.receiptRef).toBe("RCPT-1");
  });

  test("GET /inventory/status-summary returns totals for authorized user", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const summary = response.body.summary as InventoryStatusSummaryRecord[];
    const storage = summary.find(
      (entry: InventoryStatusSummaryRecord) => entry.status === "storage",
    );
    expect(storage?.totalQuantity).toBe(10);
  });

  test("GET /reports/materials-collected requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/materials-collected");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/materials-collected")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/materials-collected")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
  });

  test("GET /reports/materials-collected validates date filters and range", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const invalidFromDate = await supertest(server)
      .get("/reports/materials-collected?fromDate=2026-99-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidFromDate.status).toBe(400);

    const invalidRange = await supertest(server)
      .get("/reports/materials-collected?fromDate=2026-03-10&toDate=2026-03-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidRange.status).toBe(400);
  });

  test("GET /reports/materials-collected returns grouped rows with applied filters", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const filtered = await supertest(server)
      .get(
        "/reports/materials-collected?fromDate=2026-03-01&toDate=2026-03-31&locationText=village%20a&materialTypeId=mat-1",
      )
      .set("authorization", `Bearer ${managerToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.appliedFilters).toEqual({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: "village a",
      materialTypeId: "mat-1",
    });
    expect(filtered.body.rows).toEqual([
      {
        day: "2026-03-04",
        materialTypeId: "mat-1",
        materialName: "PET",
        locationText: "Village A",
        totalWeightKg: 2.9,
        totalPoints: 8.7,
      },
    ]);

    const defaultRange = await supertest(server)
      .get("/reports/materials-collected")
      .set("authorization", `Bearer ${managerToken}`);
    expect(defaultRange.status).toBe(200);
    expect(defaultRange.body.appliedFilters.fromDate).toBe("2026-02-04");
    expect(defaultRange.body.appliedFilters.toDate).toBe("2026-03-05");
    expect(defaultRange.body.rows).toHaveLength(2);
  });

  test("GET /reports/points-liability requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/points-liability");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/points-liability")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/points-liability")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
  });

  test("GET /reports/points-liability returns positive balances and filtered summary", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const defaultReport = await supertest(server)
      .get("/reports/points-liability")
      .set("authorization", `Bearer ${managerToken}`);
    expect(defaultReport.status).toBe(200);
    expect(defaultReport.body.appliedFilters).toEqual({ search: null });
    expect(defaultReport.body.rows).toEqual([
      {
        personId: "person-a",
        name: "Alice",
        surname: "Zulu",
        balancePoints: 30.3,
      },
      {
        personId: "person-b",
        name: "Jane",
        surname: "Doe",
        balancePoints: 8.4,
      },
    ]);
    expect(defaultReport.body.summary).toEqual({
      totalOutstandingPoints: 38.7,
      personCount: 2,
    });

    const filtered = await supertest(server)
      .get("/reports/points-liability?search=doe")
      .set("authorization", `Bearer ${managerToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.appliedFilters).toEqual({ search: "doe" });
    expect(filtered.body.rows).toEqual([
      {
        personId: "person-b",
        name: "Jane",
        surname: "Doe",
        balancePoints: 8.4,
      },
    ]);
    expect(filtered.body.summary).toEqual({
      totalOutstandingPoints: 8.4,
      personCount: 1,
    });
  });

  test("GET /reports/inventory-status requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/inventory-status");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/inventory-status")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/inventory-status")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.summary)).toBe(true);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
  });

  test("GET /reports/inventory-status returns zero summary statuses and positive detail rows", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .get("/reports/inventory-status")
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual([
      { status: "storage", totalQuantity: 6, totalCostValue: 25.5 },
      { status: "shop", totalQuantity: 3, totalCostValue: 12.75 },
      { status: "sold", totalQuantity: 1, totalCostValue: 4.25 },
      { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
      { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
      { status: "missing", totalQuantity: 0, totalCostValue: 0 },
    ]);
    expect(response.body.rows).toEqual([
      {
        status: "storage",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 6,
        unitCost: 4.25,
        totalCostValue: 25.5,
      },
      {
        status: "shop",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 3,
        unitCost: 4.25,
        totalCostValue: 12.75,
      },
      {
        status: "sold",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 1,
        unitCost: 4.25,
        totalCostValue: 4.25,
      },
    ]);
  });

  test("GET /reports/inventory-status-log requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/inventory-status-log");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/inventory-status-log")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/inventory-status-log")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
  });

  test("GET /reports/inventory-status-log validates filters and applies default date range", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const invalidDate = await supertest(server)
      .get("/reports/inventory-status-log?fromDate=2026-99-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidDate.status).toBe(400);

    const invalidStatus = await supertest(server)
      .get("/reports/inventory-status-log?fromStatus=nope")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidStatus.status).toBe(400);

    const invalidRange = await supertest(server)
      .get("/reports/inventory-status-log?fromDate=2026-03-10&toDate=2026-03-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidRange.status).toBe(400);

    const defaultRange = await supertest(server)
      .get("/reports/inventory-status-log")
      .set("authorization", `Bearer ${managerToken}`);
    expect(defaultRange.status).toBe(200);
    expect(defaultRange.body.appliedFilters).toEqual({
      fromDate: "2026-02-04",
      toDate: "2026-03-05",
      fromStatus: null,
      toStatus: null,
    });
  });

  test("GET /reports/inventory-status-log returns applied rows with resolved batch context", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .get(
        "/reports/inventory-status-log?fromDate=2026-03-04&toDate=2026-03-04&fromStatus=storage&toStatus=shop",
      )
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.appliedFilters).toEqual({
      fromDate: "2026-03-04",
      toDate: "2026-03-04",
      fromStatus: "storage",
      toStatus: "shop",
    });
    expect(response.body.rows).toEqual([
      {
        eventId: "evt-log-1",
        eventType: "inventory.status_changed",
        occurredAt: "2026-03-04T10:00:00.000Z",
        inventoryBatchId: "batch-1",
        itemId: "item-1",
        itemName: "Soap",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 4,
        reason: "Move to shop",
        notes: null,
      },
    ]);
  });

  test("GET /reports/sales requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/sales");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/sales")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/sales")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
  });

  test("GET /reports/sales validates filters and applies default date range", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const invalidDate = await supertest(server)
      .get("/reports/sales?fromDate=2026-99-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidDate.status).toBe(400);

    const invalidRange = await supertest(server)
      .get("/reports/sales?fromDate=2026-03-10&toDate=2026-03-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidRange.status).toBe(400);

    const defaultRange = await supertest(server)
      .get("/reports/sales")
      .set("authorization", `Bearer ${managerToken}`);
    expect(defaultRange.status).toBe(200);
    expect(defaultRange.body.appliedFilters).toEqual({
      fromDate: "2026-02-04",
      toDate: "2026-03-05",
      locationText: null,
      itemId: null,
    });
  });

  test("GET /reports/sales returns grouped rows with filtered summary", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .get(
        "/reports/sales?fromDate=2026-03-01&toDate=2026-03-05&locationText=village%20a&itemId=item-1",
      )
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.appliedFilters).toEqual({
      fromDate: "2026-03-01",
      toDate: "2026-03-05",
      locationText: "village a",
      itemId: "item-1",
    });
    expect(response.body.rows).toEqual([
      {
        day: "2026-03-04",
        itemId: "item-1",
        itemName: "Soap",
        locationText: "Village A",
        totalQuantity: 5,
        totalPoints: 52.5,
        saleCount: 2,
      },
    ]);
    expect(response.body.summary).toEqual({
      totalQuantity: 5,
      totalPoints: 52.5,
      saleCount: 2,
    });
  });

  test("GET /reports/cashflow requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/reports/cashflow");
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .get("/reports/cashflow")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await supertest(server)
      .get("/reports/cashflow")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.rows)).toBe(true);
    expect(Array.isArray(allowed.body.expenseCategories)).toBe(true);
  });

  test("GET /reports/cashflow validates filters and applies default date range", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const invalidDate = await supertest(server)
      .get("/reports/cashflow?fromDate=2026-99-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidDate.status).toBe(400);

    const invalidRange = await supertest(server)
      .get("/reports/cashflow?fromDate=2026-03-10&toDate=2026-03-01")
      .set("authorization", `Bearer ${managerToken}`);
    expect(invalidRange.status).toBe(400);

    const defaultRange = await supertest(server)
      .get("/reports/cashflow")
      .set("authorization", `Bearer ${managerToken}`);
    expect(defaultRange.status).toBe(200);
    expect(defaultRange.body.appliedFilters).toEqual({
      fromDate: "2026-02-04",
      toDate: "2026-03-05",
      locationText: null,
    });
  });

  test("GET /reports/cashflow returns filtered rows, summary, and expense categories", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .get("/reports/cashflow?fromDate=2026-03-01&toDate=2026-03-05&locationText=village%20a")
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.appliedFilters).toEqual({
      fromDate: "2026-03-01",
      toDate: "2026-03-05",
      locationText: "village a",
    });
    expect(response.body.rows).toEqual([
      {
        day: "2026-03-04",
        salesPointsValue: 52.5,
        expenseCashTotal: 18.5,
        netCashflow: 34,
        saleCount: 2,
        expenseCount: 2,
      },
      {
        day: "2026-03-05",
        salesPointsValue: 10.5,
        expenseCashTotal: 5.25,
        netCashflow: 5.25,
        saleCount: 1,
        expenseCount: 1,
      },
    ]);
    expect(response.body.summary).toEqual({
      totalSalesPointsValue: 63,
      totalExpenseCash: 23.75,
      netCashflow: 39.25,
      saleCount: 3,
      expenseCount: 3,
    });
    expect(response.body.expenseCategories).toEqual([
      {
        category: "Fuel",
        totalCashAmount: 18.5,
        expenseCount: 2,
      },
    ]);
  });

  test("POST /inventory/status-changes denies user and applies valid moves for administrator", async () => {
    const server = createApiServer(createDependencies());
    const userToken = await loginAndGetToken(server, "user", userPasscode);
    const administratorToken = await loginAndGetToken(
      server,
      "administrator",
      administratorPasscode,
    );

    const forbidden = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${userToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 1,
        reason: "move to shop",
      });
    expect(forbidden.status).toBe(403);

    const underflow = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 99,
        reason: "move to shop",
      });
    expect(underflow.status).toBe(409);
    expect(underflow.body.error).toBe("INVENTORY_UNDERFLOW");
    expect(underflow.body.availableQuantity).toBe(10);

    const success = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 4,
        reason: "move to shop",
      });
    expect(success.status).toBe(201);

    const summary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${userToken}`);
    expect(summary.status).toBe(200);
    const summaryRows = summary.body.summary as InventoryStatusSummaryRecord[];
    const storage = summaryRows.find(
      (entry: InventoryStatusSummaryRecord) => entry.status === "storage",
    );
    const shop = summaryRows.find((entry: InventoryStatusSummaryRecord) => entry.status === "shop");
    expect(storage?.totalQuantity).toBe(6);
    expect(shop?.totalQuantity).toBe(4);
  });

  test("POST /inventory/adjustments/requests allows user and records request event", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/inventory/adjustments/requests")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        requestedStatus: "spoiled",
        quantity: 1,
        reason: "packaging tear",
      });

    expect(response.status).toBe(201);
    expect(response.body.requestEventId).toBeDefined();
  });

  test("POST /points/adjustments/requests allows user and records request event", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .post("/points/adjustments/requests")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        deltaPoints: 2.5,
        reason: "manual correction request",
      });

    expect(response.status).toBe(201);
    expect(response.body.requestEventId).toBeDefined();
  });

  test("GET /adjustments/requests returns pending requests for administrator", async () => {
    const server = createApiServer(createDependencies());
    const userToken = await loginAndGetToken(server, "user", userPasscode);
    const administratorToken = await loginAndGetToken(
      server,
      "administrator",
      administratorPasscode,
    );

    await supertest(server)
      .post("/points/adjustments/requests")
      .set("authorization", `Bearer ${userToken}`)
      .send({
        personId: "person-a",
        deltaPoints: 2.5,
        reason: "manual correction request",
      });

    const response = await supertest(server)
      .get("/adjustments/requests?type=points&status=pending")
      .set("authorization", `Bearer ${administratorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.requests).toHaveLength(1);
    expect(response.body.requests[0]?.requestType).toBe("points");
    expect(response.body.requests[0]?.status).toBe("pending");
  });

  test("POST /points/adjustments/apply requires administrator and records apply event", async () => {
    const server = createApiServer(createDependencies());
    const userToken = await loginAndGetToken(server, "user", userPasscode);
    const administratorToken = await loginAndGetToken(
      server,
      "administrator",
      administratorPasscode,
    );

    const requested = await supertest(server)
      .post("/points/adjustments/requests")
      .set("authorization", `Bearer ${userToken}`)
      .send({
        personId: "person-a",
        deltaPoints: 2.5,
        reason: "manual correction request",
      });
    const requestEventId = requested.body.requestEventId as string;

    const denied = await supertest(server)
      .post("/points/adjustments/apply")
      .set("authorization", `Bearer ${userToken}`)
      .send({
        personId: "person-a",
        deltaPoints: 2.5,
        reason: "approved",
      });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/points/adjustments/apply")
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        requestEventId,
        personId: "person-a",
        deltaPoints: 2.5,
        reason: "approved",
      });
    expect(allowed.status).toBe(201);
    expect(allowed.body.eventId).toBeDefined();
  });

  test("user management endpoints list, create, and update for administrator", async () => {
    const server = createApiServer(createDependencies());
    const administratorToken = await loginAndGetToken(
      server,
      "administrator",
      administratorPasscode,
    );

    const listed = await supertest(server)
      .get("/users")
      .set("authorization", `Bearer ${administratorToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.users.length).toBeGreaterThan(0);

    const created = await supertest(server)
      .post("/users")
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        username: "new-user",
        role: "user",
        passcode: "4321",
      });
    expect(created.status).toBe(201);
    const createdId = created.body.user.id as string;

    const updated = await supertest(server)
      .patch(`/users/${createdId}`)
      .set("authorization", `Bearer ${administratorToken}`)
      .send({
        username: "renamed-user",
        role: "administrator",
        passcode: "8888",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.user.username).toBe("renamed-user");
    expect(updated.body.user.role).toBe("administrator");
  });

  test("logs request context when route handler throws", async () => {
    const loggerCalls: Array<{ method: string; path: string; message: string }> = [];
    const errorLogger: ApiErrorLogger = {
      logRequestError: (context, error) => {
        loggerCalls.push({
          method: context.method,
          path: context.path,
          message: error instanceof Error ? error.message : String(error),
        });
      },
      logFatalError: () => undefined,
    };
    const server = createApiServer({
      ...createDependencies(),
      errorLogger,
      listPeople: async () => {
        throw new Error("list-people-explosion");
      },
    });
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server).get("/people").set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(loggerCalls).toEqual([
      {
        method: "GET",
        path: "/people",
        message: "list-people-explosion",
      },
    ]);
  });

  test("GET /ledger/:personId/entries returns projected entries", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "user", userPasscode);

    const response = await supertest(server)
      .get("/ledger/person-a/entries")
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.entries.length).toBe(2);
  });

  test("sync push and pull work with cursor", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);
    const eventId = "88a02142-9ba0-49cc-9f01-b4b4726d1e44";

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId,
            eventType: "person.created",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-b",
            schemaVersion: 1,
            payload: {
              personId: "person-sync",
              name: "Sync",
              surname: "Person",
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    expect(pull.status).toBe(200);
    expect(Array.isArray(pull.body.events)).toBe(true);
  });

  test("sync push forwards lastKnownCursor and returns mixed acknowledgements", async () => {
    let capturedCursor: string | null | undefined;
    const dependencies = createDependencies();
    const server = createApiServer({
      ...dependencies,
      appendEvents: async (incomingEvents, lastKnownCursor) => {
        capturedCursor = lastKnownCursor;
        return incomingEvents.map((event, index) => {
          if (index === 0) {
            return { status: "accepted" as const };
          }
          if (index === 1) {
            return { status: "duplicate" as const };
          }
          return { status: "rejected" as const, reason: "STALE_CURSOR_CONFLICT" };
        });
      },
    });
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);
    const cursor = "eyJyZWNvcmRlZEF0IjoiMjAyNi0wMy0wNVQxMjowMDowMC4wMDBaIiwiZXZlbnRJZCI6ImUxIn0";

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        lastKnownCursor: cursor,
        events: [
          {
            eventId: "evt-1",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 5,
            },
          },
          {
            eventId: "evt-2",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:01:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 6,
            },
          },
          {
            eventId: "evt-3",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:02:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 7,
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(capturedCursor).toBe(cursor);
    expect(push.body.acknowledgements).toEqual([
      { eventId: "evt-1", status: "accepted" },
      { eventId: "evt-2", status: "duplicate" },
      { eventId: "evt-3", status: "rejected", reason: "STALE_CURSOR_CONFLICT" },
    ]);
  });

  test("sync push accepts an old free-text locationText on the event envelope and pull preserves it verbatim", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: "evt-old-location",
            eventType: "intake.recorded",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            locationText: "Village A",
            payload: {
              personId: "person-a",
              lines: [{ materialTypeId: "mat-1", weightKg: 2, pointsPerKg: 1, pointsAwarded: 2 }],
              totalPoints: 2,
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    const pulled = (pull.body.events as Array<{ eventId: string; locationText?: unknown }>).find(
      (event) => event.eventId === "evt-old-location",
    );
    expect(pulled?.locationText).toBe("Village A");
  });

  test("sync push accepts locationText: null on the event envelope, matching the current web client shape, and preserves it through pull", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: "evt-null-location",
            eventType: "sale.recorded",
            occurredAt: "2026-03-05T12:05:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            locationText: null,
            payload: {
              personId: "person-a",
              lines: [
                {
                  itemId: "item-1",
                  inventoryBatchId: null,
                  quantity: 1,
                  pointsPrice: 5,
                  lineTotalPoints: 5,
                },
              ],
              totalPoints: 5,
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    const pulled = (pull.body.events as Array<{ eventId: string; locationText?: unknown }>).find(
      (event) => event.eventId === "evt-null-location",
    );
    expect(pulled?.locationText).toBeNull();
  });

  test("sync push accepts an event with no locationText field at all, and pull does not inject a default", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: "evt-no-location-field",
            eventType: "person.created",
            occurredAt: "2026-03-05T12:10:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              personId: "person-no-location",
              name: "No",
              surname: "Location",
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    const pulled = (pull.body.events as Array<Record<string, unknown>>).find(
      (event) => event.eventId === "evt-no-location-field",
    );
    expect(pulled).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(pulled!, "locationText")).toBe(false);
  });

  test("sync push accepts an old-shape intake.recorded payload with no collectionPointId and pull preserves its absence", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: "evt-old-intake-shape",
            eventType: "intake.recorded",
            occurredAt: "2026-03-05T12:15:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            locationText: "Village A",
            payload: {
              personId: "person-a",
              lines: [{ materialTypeId: "mat-1", weightKg: 1, pointsPerKg: 1, pointsAwarded: 1 }],
              totalPoints: 1,
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    const pulled = (pull.body.events as Array<Record<string, unknown>>).find(
      (event) => event.eventId === "evt-old-intake-shape",
    );
    expect(pulled).toBeDefined();
    const payload = pulled?.payload as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, "collectionPointId")).toBe(false);
  });

  test("sync push accepts a new-shape sale.recorded payload with a collectionPointId and pull preserves it verbatim", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "administrator", administratorPasscode);

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: "evt-new-sale-shape",
            eventType: "sale.recorded",
            occurredAt: "2026-03-05T12:20:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              personId: "person-a",
              lines: [
                {
                  itemId: "item-1",
                  inventoryBatchId: null,
                  quantity: 1,
                  pointsPrice: 1,
                  lineTotalPoints: 1,
                },
              ],
              totalPoints: 1,
              collectionPointId: "cp-1",
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    const pulled = (pull.body.events as Array<Record<string, unknown>>).find(
      (event) => event.eventId === "evt-new-sale-shape",
    );
    const payload = pulled?.payload as Record<string, unknown>;
    expect(payload.collectionPointId).toBe("cp-1");
  });

  test("GET /sync/conflicts requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const denied = await supertest(server)
      .get("/sync/conflicts?status=open&limit=10")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .get("/sync/conflicts?status=open&limit=10")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.conflicts)).toBe(true);
    expect(allowed.body.conflicts).toHaveLength(1);
    expect(allowed.body.conflicts[0]?.conflictId).toBe("conflict-open");
  });

  test("POST /sync/conflicts/:id/resolve resolves open conflict for manager", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .post("/sync/conflicts/conflict-open/resolve")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        resolution: "merged",
        notes: "manual merge",
      });

    expect(response.status).toBe(200);
    expect(response.body.conflictId).toBe("conflict-open");
    expect(response.body.resolutionEventId).toBe("event-resolve-new");
  });

  test("POST /sync/conflicts/:id/resolve returns 404 for unknown conflict", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const response = await supertest(server)
      .post("/sync/conflicts/conflict-missing/resolve")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        resolution: "rejected",
        notes: "not found",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("CONFLICT_NOT_FOUND");
  });

  test("GET /sync/audit/report requires manager role and returns report", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/sync/audit/report?limit=10");
    expect(unauthorized.status).toBe(401);

    const denied = await supertest(server)
      .get("/sync/audit/report?limit=10")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .get("/sync/audit/report?limit=10")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.totalIssues).toBe(1);
    expect(Array.isArray(allowed.body.issues)).toBe(true);
  });

  test("GET /sync/reconciliation/report requires manager role and validates filters", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "user", userPasscode);
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const unauthorized = await supertest(server).get("/sync/reconciliation/report?limit=10");
    expect(unauthorized.status).toBe(401);

    const denied = await supertest(server)
      .get("/sync/reconciliation/report?limit=10")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(denied.status).toBe(403);

    const badCode = await supertest(server)
      .get("/sync/reconciliation/report?code=NOPE")
      .set("authorization", `Bearer ${managerToken}`);
    expect(badCode.status).toBe(400);

    const badRepairableOnly = await supertest(server)
      .get("/sync/reconciliation/report?repairableOnly=maybe")
      .set("authorization", `Bearer ${managerToken}`);
    expect(badRepairableOnly.status).toBe(400);

    const allowed = await supertest(server)
      .get("/sync/reconciliation/report?limit=1&code=POINTS_BALANCE_MISMATCH&repairableOnly=true")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.summary.totalIssues).toBe(1);
    expect(allowed.body.issues[0]?.issueId).toBe("POINTS_BALANCE_MISMATCH:person-a");
  });

  test("POST /sync/reconciliation/issues/:issueId/repair validates request and returns repair result", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const missingNotes = await supertest(server)
      .post("/sync/reconciliation/issues/POINTS_BALANCE_MISMATCH:person-a/repair")
      .set("authorization", `Bearer ${managerToken}`)
      .send({});
    expect(missingNotes.status).toBe(400);

    const notFound = await supertest(server)
      .post("/sync/reconciliation/issues/POINTS_BALANCE_MISMATCH:missing/repair")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ notes: "checked ledger" });
    expect(notFound.status).toBe(404);

    const success = await supertest(server)
      .post("/sync/reconciliation/issues/POINTS_BALANCE_MISMATCH:person-a/repair")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ notes: "checked ledger" });
    expect(success.status).toBe(200);
    expect(success.body.repairKind).toBe("points_adjustment");
    expect(success.body.repairEventId).toBe("reconciliation-repair-event");
  });

  test("GET /sync/audit/event/:eventId returns 404 for unknown event", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);

    const missing = await supertest(server)
      .get("/sync/audit/event/missing-event")
      .set("authorization", `Bearer ${managerToken}`);
    expect(missing.status).toBe(404);
  });

  test("GET /sync/audit/event/:eventId returns linked metadata", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "administrator", administratorPasscode);
    const eventId = "e2cfd0ff-f35e-442e-8694-f6fc8533a400";

    await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        events: [
          {
            eventId,
            eventType: "person.created",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-b",
            schemaVersion: 1,
            payload: {
              personId: "person-audit",
              name: "Audit",
              surname: "Event",
            },
          },
        ],
      });

    const response = await supertest(server)
      .get(`/sync/audit/event/${eventId}`)
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.event.eventId).toBe(eventId);
    expect(Array.isArray(response.body.linkedConflictIds)).toBe(true);
  });
});
