export type ISODateTime = string;

export type UserId = string;
export type PersonId = string;
export type MaterialTypeId = string;
export type ItemId = string;
export type InventoryBatchId = string;
export type EventId = string;
export type DeviceId = string;
export type ConflictId = string;

export type StaffRole = "collector" | "shop_operator" | "manager";

export type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
export type InventoryAdjustmentStatus = "spoiled" | "damaged" | "missing";

export type InventoryAcquisitionType = "procurement" | "adjustment";

export type PointsSourceEventType =
  | "intake.recorded"
  | "sale.recorded"
  | "points.adjustment_applied";

export type AdjustmentRequestStatus = "pending" | "approved" | "rejected";

export type StaffUser = {
  id: UserId;
  username: string;
  role: StaffRole;
};

export type Person = {
  id: PersonId;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type MaterialType = {
  id: MaterialTypeId;
  name: string;
  pointsPerKg: number;
};

export type Item = {
  id: ItemId;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

export type InventoryBatch = {
  id: InventoryBatchId;
  itemId: ItemId;
  quantity: number;
  status: InventoryStatus;
  locationText?: string | null;
  acquisitionType: InventoryAcquisitionType;
  acquisitionEventId: EventId;
};

export type InventoryStatusChange = {
  id: EventId;
  inventoryBatchId: InventoryBatchId;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
  occurredAt: ISODateTime;
  actorUserId: UserId;
};

export type PointsLedgerEntry = {
  id: EventId;
  personId: PersonId;
  deltaPoints: number;
  occurredAt: ISODateTime;
  locationText?: string | null;
  sourceEventType: PointsSourceEventType;
  sourceEventId: EventId;
};

export type AdjustmentRequest = {
  id: EventId;
  requestType: "points" | "inventory";
  entityRef: string;
  quantity?: number | null;
  reason: string;
  requestedByUserId: UserId;
  requestedAt: ISODateTime;
  status: AdjustmentRequestStatus;
  resolvedByUserId?: UserId | null;
  resolvedAt?: ISODateTime | null;
  resolutionNotes?: string | null;
};
