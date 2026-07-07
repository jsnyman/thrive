import type {
  CollectionPointId,
  ConflictId,
  DeviceId,
  EventId,
  InventoryAdjustmentStatus,
  InventoryBatchId,
  InventoryStatus,
  ISODateTime,
  ItemId,
  MaterialTypeId,
  PersonId,
  StaffRole,
  UserId,
} from "./types";

export type EventSchemaVersion = 1;

export type EventType =
  | "person.created"
  | "person.profile_updated"
  | "person.removed"
  | "material_type.created"
  | "material_type.updated"
  | "item.created"
  | "item.updated"
  | "collection_point.created"
  | "collection_point.updated"
  | "staff_user.created"
  | "staff_user.role_changed"
  | "intake.recorded"
  | "sale.recorded"
  | "procurement.recorded"
  | "procurement.corrected"
  | "expense.recorded"
  | "inventory.status_changed"
  | "inventory.adjustment_requested"
  | "inventory.adjustment_applied"
  | "points.adjustment_requested"
  | "points.adjustment_applied"
  | "conflict.detected"
  | "conflict.resolved";

export type PersonCreatedPayload = {
  personId: PersonId;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  locationText?: string | null;
};

export type PersonProfileUpdates = {
  name?: string;
  surname?: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type PersonProfileUpdatedPayload = {
  personId: PersonId;
  updates: PersonProfileUpdates;
};

export type PersonRemovedPayload = {
  personId: PersonId;
  reason: string;
};

export type MaterialTypeCreatedPayload = {
  materialTypeId: MaterialTypeId;
  name: string;
  pointsPerKg: number;
};

export type MaterialTypeUpdates = {
  name?: string;
  pointsPerKg?: number;
};

export type MaterialTypeUpdatedPayload = {
  materialTypeId: MaterialTypeId;
  updates: MaterialTypeUpdates;
};

export type ItemCreatedPayload = {
  itemId: ItemId;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

export type ItemUpdates = {
  name?: string;
  pointsPrice?: number;
  costPrice?: number | null;
  sku?: string | null;
};

export type ItemUpdatedPayload = {
  itemId: ItemId;
  updates: ItemUpdates;
};

export type CollectionPointCreatedPayload = {
  collectionPointId: CollectionPointId;
  name: string;
};

export type CollectionPointUpdates = {
  name?: string;
  isActive?: boolean;
};

export type CollectionPointUpdatedPayload = {
  collectionPointId: CollectionPointId;
  updates: CollectionPointUpdates;
};

export type StaffUserCreatedPayload = {
  userId: UserId;
  username: string;
  role: StaffRole;
};

export type StaffUserRoleChangedPayload = {
  userId: UserId;
  fromRole?: StaffRole | null;
  toRole: StaffRole;
};

export type IntakeLine = {
  materialTypeId: MaterialTypeId;
  weightKg: number;
  pointsPerKg: number;
  pointsAwarded: number;
};

export type IntakeRecordedPayload = {
  personId: PersonId;
  lines: IntakeLine[];
  totalPoints: number;
  locationText?: string | null;
};

export type SaleLine = {
  itemId: ItemId;
  inventoryBatchId?: InventoryBatchId | null;
  quantity: number;
  pointsPrice: number;
  lineTotalPoints: number;
};

export type SaleRecordedPayload = {
  personId: PersonId;
  lines: SaleLine[];
  totalPoints: number;
  locationText?: string | null;
};

export type ProcurementLine = {
  itemId: ItemId;
  inventoryBatchId: InventoryBatchId;
  quantity: number;
  unitCost: number;
  lineTotalCost: number;
  unitSellingPrice: number;
  markupPercent: number;
};

export type ProcurementRecordedPayload = {
  supplierName?: string | null;
  tripDistanceKm?: number | null;
  cashTotal: number;
  lines: ProcurementLine[];
};

export type ProcurementCorrectedPayload = {
  procurementEventId: EventId;
  supplierName?: string | null;
  tripDistanceKm?: number | null;
  cashTotal: number;
  lines: ProcurementLine[];
  reason: string;
};

export type ExpenseRecordedPayload = {
  category: string;
  cashAmount: number;
  incurredDate?: string | null;
  notes?: string | null;
  receiptRef?: string | null;
};

export type InventoryStatusChangedPayload = {
  inventoryBatchId: InventoryBatchId;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
};

export type InventoryAdjustmentRequestedPayload = {
  inventoryBatchId: InventoryBatchId;
  requestedStatus: InventoryAdjustmentStatus;
  quantity: number;
  reason: string;
  notes?: string | null;
};

export type InventoryAdjustmentAppliedPayload = {
  requestEventId?: EventId | null;
  inventoryBatchId: InventoryBatchId;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason: string;
  notes?: string | null;
};

export type PointsAdjustmentRequestedPayload = {
  personId: PersonId;
  deltaPoints: number;
  reason: string;
  notes?: string | null;
};

export type PointsAdjustmentAppliedPayload = {
  requestEventId?: EventId | null;
  personId: PersonId;
  deltaPoints: number;
  reason: string;
  notes?: string | null;
};

export type ConflictDetectedPayload = {
  conflictId: ConflictId;
  entityType:
    | "person"
    | "intake"
    | "sale"
    | "procurement"
    | "expense"
    | "inventory_batch"
    | "points_ledger";
  entityId: string;
  detectedEventIds: EventId[];
  summary?: string | null;
};

export type ConflictResolvedPayload = {
  conflictId: ConflictId;
  resolution: "accepted" | "rejected" | "merged";
  resolvedEventId?: EventId | null;
  relatedEventIds?: EventId[] | null;
  notes: string;
};

export type EventPayloadMap = {
  "person.created": PersonCreatedPayload;
  "person.profile_updated": PersonProfileUpdatedPayload;
  "person.removed": PersonRemovedPayload;
  "material_type.created": MaterialTypeCreatedPayload;
  "material_type.updated": MaterialTypeUpdatedPayload;
  "item.created": ItemCreatedPayload;
  "item.updated": ItemUpdatedPayload;
  "collection_point.created": CollectionPointCreatedPayload;
  "collection_point.updated": CollectionPointUpdatedPayload;
  "staff_user.created": StaffUserCreatedPayload;
  "staff_user.role_changed": StaffUserRoleChangedPayload;
  "intake.recorded": IntakeRecordedPayload;
  "sale.recorded": SaleRecordedPayload;
  "procurement.recorded": ProcurementRecordedPayload;
  "procurement.corrected": ProcurementCorrectedPayload;
  "expense.recorded": ExpenseRecordedPayload;
  "inventory.status_changed": InventoryStatusChangedPayload;
  "inventory.adjustment_requested": InventoryAdjustmentRequestedPayload;
  "inventory.adjustment_applied": InventoryAdjustmentAppliedPayload;
  "points.adjustment_requested": PointsAdjustmentRequestedPayload;
  "points.adjustment_applied": PointsAdjustmentAppliedPayload;
  "conflict.detected": ConflictDetectedPayload;
  "conflict.resolved": ConflictResolvedPayload;
};

export type EventEnvelope<TType extends EventType = EventType> = {
  eventId: EventId;
  eventType: TType;
  occurredAt: ISODateTime;
  recordedAt?: ISODateTime | null;
  actorUserId: UserId;
  deviceId: DeviceId;
  locationText?: string | null;
  schemaVersion: EventSchemaVersion;
  correlationId?: string | null;
  causationId?: string | null;
  payload: EventPayloadMap[TType];
};

export type Event = {
  [TType in EventType]: EventEnvelope<TType>;
}[EventType];
