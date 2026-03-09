import type { Event, EventType } from "../../../../packages/shared/src/domain/events";
import type { InventoryStatus } from "../../../../packages/shared/src/domain/types";

export type MergeRejectReason =
  | "INVALID_EVENT"
  | "STALE_CURSOR_CONFLICT"
  | "ENTITY_ALREADY_EXISTS"
  | "ENTITY_NOT_FOUND"
  | "INSUFFICIENT_POINTS"
  | "INVENTORY_UNDERFLOW"
  | "REQUEST_NOT_FOUND"
  | "CONFLICT_NOT_FOUND"
  | "UNSUPPORTED_MERGE_STATE";

export type MergeDecision =
  | { status: "accepted" }
  | { status: "duplicate" }
  | {
      status: "rejected";
      reason: MergeRejectReason;
      conflict?: MergeConflict;
    };

export type MergeConflict = {
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
};

type CursorTuple = {
  recordedAt: string;
  eventId: string;
};

type MutationMarker =
  | {
      source: "persisted";
      cursor: CursorTuple;
      eventId: string;
    }
  | {
      source: "batch";
      eventId: string;
    };

export type MergeReplayEvent = {
  event: Event;
  recordedAt: string;
};

export type MergeState = {
  knownEventIds: Set<string>;
  personIds: Set<string>;
  materialTypeIds: Set<string>;
  itemIds: Set<string>;
  staffUserIds: Set<string>;
  conflictIds: Set<string>;
  adjustmentRequestEventIds: Set<string>;
  personBalances: Map<string, number>;
  inventoryBatches: Set<string>;
  inventoryBatchStatuses: Map<string, Map<InventoryStatus, number>>;
  entityMutations: Map<string, MutationMarker>;
};

const INVENTORY_STATUSES: InventoryStatus[] = [
  "storage",
  "shop",
  "sold",
  "spoiled",
  "damaged",
  "missing",
];

const buildEntityKey = (entityType: string, entityId: string): string =>
  `${entityType}:${entityId}`;

const cloneInventoryMap = (): Map<InventoryStatus, number> => {
  const map = new Map<InventoryStatus, number>();
  for (const status of INVENTORY_STATUSES) {
    map.set(status, 0);
  }
  return map;
};

const isAfterCursor = (left: CursorTuple, right: CursorTuple): boolean => {
  if (left.recordedAt > right.recordedAt) {
    return true;
  }
  if (left.recordedAt < right.recordedAt) {
    return false;
  }
  return left.eventId > right.eventId;
};

export const decodeSyncCursor = (cursor: string | null | undefined): CursorTuple | null => {
  if (cursor === null || cursor === undefined) {
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

const setEntityMutation = (
  state: MergeState,
  entityType: string,
  entityId: string,
  marker: MutationMarker,
): void => {
  state.entityMutations.set(buildEntityKey(entityType, entityId), marker);
};

const getEntityMutation = (
  state: MergeState,
  entityType: string,
  entityId: string,
): MutationMarker | undefined => state.entityMutations.get(buildEntityKey(entityType, entityId));

const setBatchStatusQuantity = (
  state: MergeState,
  batchId: string,
  status: InventoryStatus,
  quantity: number,
): void => {
  let statusMap = state.inventoryBatchStatuses.get(batchId);
  if (statusMap === undefined) {
    statusMap = cloneInventoryMap();
    state.inventoryBatchStatuses.set(batchId, statusMap);
  }
  statusMap.set(status, quantity);
};

const getBatchStatusQuantity = (
  state: MergeState,
  batchId: string,
  status: InventoryStatus,
): number => {
  const statusMap = state.inventoryBatchStatuses.get(batchId);
  if (statusMap === undefined) {
    return 0;
  }
  return statusMap.get(status) ?? 0;
};

const addToBatchStatus = (
  state: MergeState,
  batchId: string,
  status: InventoryStatus,
  delta: number,
): void => {
  const current = getBatchStatusQuantity(state, batchId, status);
  setBatchStatusQuantity(state, batchId, status, current + delta);
};

const conflictTarget = (
  event: Event,
): { entityType: MergeConflict["entityType"]; entityId: string } => {
  switch (event.eventType) {
    case "person.created":
    case "person.profile_updated":
      return { entityType: "person", entityId: event.payload.personId };
    case "material_type.created":
    case "material_type.updated":
      return { entityType: "inventory_batch", entityId: event.payload.materialTypeId };
    case "item.created":
    case "item.updated":
      return { entityType: "inventory_batch", entityId: event.payload.itemId };
    case "staff_user.created":
    case "staff_user.role_changed":
      return { entityType: "person", entityId: event.payload.userId };
    case "intake.recorded":
      return { entityType: "intake", entityId: event.payload.personId };
    case "sale.recorded":
      return { entityType: "sale", entityId: event.payload.personId };
    case "procurement.recorded":
      return {
        entityType: "procurement",
        entityId: event.payload.lines[0]?.inventoryBatchId ?? event.eventId,
      };
    case "expense.recorded":
      return { entityType: "expense", entityId: event.eventId };
    case "inventory.status_changed":
      return { entityType: "inventory_batch", entityId: event.payload.inventoryBatchId };
    case "inventory.adjustment_requested":
      return { entityType: "inventory_batch", entityId: event.payload.inventoryBatchId };
    case "inventory.adjustment_applied":
      return { entityType: "inventory_batch", entityId: event.payload.inventoryBatchId };
    case "points.adjustment_requested":
      return { entityType: "points_ledger", entityId: event.payload.personId };
    case "points.adjustment_applied":
      return { entityType: "points_ledger", entityId: event.payload.personId };
    case "conflict.detected":
      return { entityType: event.payload.entityType, entityId: event.payload.entityId };
    case "conflict.resolved":
      return { entityType: "points_ledger", entityId: event.payload.conflictId };
    default:
      return { entityType: "points_ledger", entityId: "unknown" };
  }
};

const buildConflict = (
  event: Event,
  reason: MergeRejectReason,
  detectedEventId: string | null,
): MergeConflict => {
  const target = conflictTarget(event);
  const detectedEventIds =
    detectedEventId === null ? [event.eventId] : [detectedEventId, event.eventId];
  return {
    entityType: target.entityType,
    entityId: target.entityId,
    detectedEventIds,
    summary: reason,
  };
};

const staleConflict = (event: Event, marker: MutationMarker | undefined): MergeDecision => {
  const conflictEventId = marker === undefined ? null : marker.eventId;
  return {
    status: "rejected",
    reason: "STALE_CURSOR_CONFLICT",
    conflict: buildConflict(event, "STALE_CURSOR_CONFLICT", conflictEventId),
  };
};

const inventoryUnderflow = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "INVENTORY_UNDERFLOW",
  conflict: buildConflict(event, "INVENTORY_UNDERFLOW", null),
});

const entityNotFound = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "ENTITY_NOT_FOUND",
  conflict: buildConflict(event, "ENTITY_NOT_FOUND", null),
});

const entityAlreadyExists = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "ENTITY_ALREADY_EXISTS",
  conflict: buildConflict(event, "ENTITY_ALREADY_EXISTS", null),
});

const requestNotFound = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "REQUEST_NOT_FOUND",
  conflict: buildConflict(event, "REQUEST_NOT_FOUND", null),
});

const conflictNotFound = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "CONFLICT_NOT_FOUND",
  conflict: buildConflict(event, "CONFLICT_NOT_FOUND", null),
});

const insufficientPoints = (event: Event): MergeDecision => ({
  status: "rejected",
  reason: "INSUFFICIENT_POINTS",
  conflict: buildConflict(event, "INSUFFICIENT_POINTS", null),
});

const hasPersistedChangeAfterCursor = (
  marker: MutationMarker | undefined,
  lastKnownCursor: CursorTuple | null,
): boolean => {
  if (marker === undefined) {
    return false;
  }
  if (marker.source === "batch") {
    return false;
  }
  if (lastKnownCursor === null) {
    return true;
  }
  return isAfterCursor(marker.cursor, lastKnownCursor);
};

const applyStateMutation = (state: MergeState, event: Event, marker: MutationMarker): void => {
  state.knownEventIds.add(event.eventId);
  switch (event.eventType) {
    case "person.created":
      state.personIds.add(event.payload.personId);
      setEntityMutation(state, "person", event.payload.personId, marker);
      return;
    case "person.profile_updated":
      setEntityMutation(state, "person", event.payload.personId, marker);
      return;
    case "material_type.created":
      state.materialTypeIds.add(event.payload.materialTypeId);
      setEntityMutation(state, "material_type", event.payload.materialTypeId, marker);
      return;
    case "material_type.updated":
      setEntityMutation(state, "material_type", event.payload.materialTypeId, marker);
      return;
    case "item.created":
      state.itemIds.add(event.payload.itemId);
      setEntityMutation(state, "item", event.payload.itemId, marker);
      return;
    case "item.updated":
      setEntityMutation(state, "item", event.payload.itemId, marker);
      return;
    case "staff_user.created":
      state.staffUserIds.add(event.payload.userId);
      setEntityMutation(state, "staff_user", event.payload.userId, marker);
      return;
    case "staff_user.role_changed":
      setEntityMutation(state, "staff_user", event.payload.userId, marker);
      return;
    case "intake.recorded": {
      const current = state.personBalances.get(event.payload.personId) ?? 0;
      state.personBalances.set(event.payload.personId, current + event.payload.totalPoints);
      return;
    }
    case "sale.recorded": {
      const current = state.personBalances.get(event.payload.personId) ?? 0;
      state.personBalances.set(event.payload.personId, current - event.payload.totalPoints);
      for (const line of event.payload.lines) {
        if (line.inventoryBatchId !== null && line.inventoryBatchId !== undefined) {
          addToBatchStatus(state, line.inventoryBatchId, "shop", line.quantity * -1);
          addToBatchStatus(state, line.inventoryBatchId, "sold", line.quantity);
        }
      }
      return;
    }
    case "procurement.recorded":
      for (const line of event.payload.lines) {
        state.inventoryBatches.add(line.inventoryBatchId);
        addToBatchStatus(state, line.inventoryBatchId, "storage", line.quantity);
      }
      return;
    case "inventory.status_changed":
      addToBatchStatus(
        state,
        event.payload.inventoryBatchId,
        event.payload.fromStatus,
        event.payload.quantity * -1,
      );
      addToBatchStatus(
        state,
        event.payload.inventoryBatchId,
        event.payload.toStatus,
        event.payload.quantity,
      );
      return;
    case "inventory.adjustment_requested":
      state.adjustmentRequestEventIds.add(event.eventId);
      return;
    case "inventory.adjustment_applied":
      addToBatchStatus(
        state,
        event.payload.inventoryBatchId,
        event.payload.fromStatus,
        event.payload.quantity * -1,
      );
      addToBatchStatus(
        state,
        event.payload.inventoryBatchId,
        event.payload.toStatus,
        event.payload.quantity,
      );
      return;
    case "points.adjustment_requested":
      state.adjustmentRequestEventIds.add(event.eventId);
      return;
    case "points.adjustment_applied": {
      const current = state.personBalances.get(event.payload.personId) ?? 0;
      state.personBalances.set(event.payload.personId, current + event.payload.deltaPoints);
      return;
    }
    case "conflict.detected":
      state.conflictIds.add(event.payload.conflictId);
      return;
    case "conflict.resolved":
      return;
    case "expense.recorded":
      return;
    default:
      return;
  }
};

export const createMergeState = (replayEvents: MergeReplayEvent[]): MergeState => {
  const state: MergeState = {
    knownEventIds: new Set<string>(),
    personIds: new Set<string>(),
    materialTypeIds: new Set<string>(),
    itemIds: new Set<string>(),
    staffUserIds: new Set<string>(),
    conflictIds: new Set<string>(),
    adjustmentRequestEventIds: new Set<string>(),
    personBalances: new Map<string, number>(),
    inventoryBatches: new Set<string>(),
    inventoryBatchStatuses: new Map<string, Map<InventoryStatus, number>>(),
    entityMutations: new Map<string, MutationMarker>(),
  };

  for (const replayEvent of replayEvents) {
    applyStateMutation(state, replayEvent.event, {
      source: "persisted",
      cursor: {
        recordedAt: replayEvent.recordedAt,
        eventId: replayEvent.event.eventId,
      },
      eventId: replayEvent.event.eventId,
    });
  }

  return state;
};

const isUpdatableEventType = (eventType: EventType): boolean =>
  eventType === "person.profile_updated" ||
  eventType === "material_type.updated" ||
  eventType === "item.updated" ||
  eventType === "staff_user.role_changed";

export const evaluateMergeDecision = (
  state: MergeState,
  event: Event,
  lastKnownCursor: CursorTuple | null,
): MergeDecision => {
  if (state.knownEventIds.has(event.eventId)) {
    return { status: "duplicate" };
  }

  switch (event.eventType) {
    case "person.created": {
      if (state.personIds.has(event.payload.personId)) {
        return entityAlreadyExists(event);
      }
      return { status: "accepted" };
    }
    case "person.profile_updated": {
      if (!state.personIds.has(event.payload.personId)) {
        return entityNotFound(event);
      }
      const marker = getEntityMutation(state, "person", event.payload.personId);
      if (
        isUpdatableEventType(event.eventType) &&
        hasPersistedChangeAfterCursor(marker, lastKnownCursor)
      ) {
        return staleConflict(event, marker);
      }
      return { status: "accepted" };
    }
    case "material_type.created": {
      if (state.materialTypeIds.has(event.payload.materialTypeId)) {
        return entityAlreadyExists(event);
      }
      return { status: "accepted" };
    }
    case "material_type.updated": {
      if (!state.materialTypeIds.has(event.payload.materialTypeId)) {
        return entityNotFound(event);
      }
      const marker = getEntityMutation(state, "material_type", event.payload.materialTypeId);
      if (
        isUpdatableEventType(event.eventType) &&
        hasPersistedChangeAfterCursor(marker, lastKnownCursor)
      ) {
        return staleConflict(event, marker);
      }
      return { status: "accepted" };
    }
    case "item.created": {
      if (state.itemIds.has(event.payload.itemId)) {
        return entityAlreadyExists(event);
      }
      return { status: "accepted" };
    }
    case "item.updated": {
      if (!state.itemIds.has(event.payload.itemId)) {
        return entityNotFound(event);
      }
      const marker = getEntityMutation(state, "item", event.payload.itemId);
      if (
        isUpdatableEventType(event.eventType) &&
        hasPersistedChangeAfterCursor(marker, lastKnownCursor)
      ) {
        return staleConflict(event, marker);
      }
      return { status: "accepted" };
    }
    case "staff_user.created": {
      if (state.staffUserIds.has(event.payload.userId)) {
        return entityAlreadyExists(event);
      }
      return { status: "accepted" };
    }
    case "staff_user.role_changed": {
      if (!state.staffUserIds.has(event.payload.userId)) {
        return entityNotFound(event);
      }
      const marker = getEntityMutation(state, "staff_user", event.payload.userId);
      if (
        isUpdatableEventType(event.eventType) &&
        hasPersistedChangeAfterCursor(marker, lastKnownCursor)
      ) {
        return staleConflict(event, marker);
      }
      return { status: "accepted" };
    }
    case "intake.recorded": {
      if (!state.personIds.has(event.payload.personId)) {
        return entityNotFound(event);
      }
      for (const line of event.payload.lines) {
        if (!state.materialTypeIds.has(line.materialTypeId)) {
          return entityNotFound(event);
        }
      }
      return { status: "accepted" };
    }
    case "sale.recorded": {
      if (!state.personIds.has(event.payload.personId)) {
        return entityNotFound(event);
      }
      for (const line of event.payload.lines) {
        if (!state.itemIds.has(line.itemId)) {
          return entityNotFound(event);
        }
        if (line.inventoryBatchId !== null && line.inventoryBatchId !== undefined) {
          if (!state.inventoryBatches.has(line.inventoryBatchId)) {
            return entityNotFound(event);
          }
          const shopQty = getBatchStatusQuantity(state, line.inventoryBatchId, "shop");
          if (shopQty < line.quantity) {
            return inventoryUnderflow(event);
          }
        }
      }
      const balance = state.personBalances.get(event.payload.personId) ?? 0;
      if (balance - event.payload.totalPoints < 0) {
        return insufficientPoints(event);
      }
      return { status: "accepted" };
    }
    case "procurement.recorded": {
      for (const line of event.payload.lines) {
        if (!state.itemIds.has(line.itemId)) {
          return entityNotFound(event);
        }
        if (state.inventoryBatches.has(line.inventoryBatchId)) {
          return entityAlreadyExists(event);
        }
      }
      return { status: "accepted" };
    }
    case "expense.recorded":
      return { status: "accepted" };
    case "inventory.status_changed": {
      if (!state.inventoryBatches.has(event.payload.inventoryBatchId)) {
        return entityNotFound(event);
      }
      const fromQty = getBatchStatusQuantity(
        state,
        event.payload.inventoryBatchId,
        event.payload.fromStatus,
      );
      if (fromQty < event.payload.quantity) {
        return inventoryUnderflow(event);
      }
      return { status: "accepted" };
    }
    case "inventory.adjustment_requested": {
      if (!state.inventoryBatches.has(event.payload.inventoryBatchId)) {
        return entityNotFound(event);
      }
      return { status: "accepted" };
    }
    case "inventory.adjustment_applied": {
      if (!state.inventoryBatches.has(event.payload.inventoryBatchId)) {
        return entityNotFound(event);
      }
      if (event.payload.requestEventId !== null && event.payload.requestEventId !== undefined) {
        if (!state.adjustmentRequestEventIds.has(event.payload.requestEventId)) {
          return requestNotFound(event);
        }
      }
      const fromQty = getBatchStatusQuantity(
        state,
        event.payload.inventoryBatchId,
        event.payload.fromStatus,
      );
      if (fromQty < event.payload.quantity) {
        return inventoryUnderflow(event);
      }
      return { status: "accepted" };
    }
    case "points.adjustment_requested": {
      if (!state.personIds.has(event.payload.personId)) {
        return entityNotFound(event);
      }
      return { status: "accepted" };
    }
    case "points.adjustment_applied": {
      if (!state.personIds.has(event.payload.personId)) {
        return entityNotFound(event);
      }
      if (event.payload.requestEventId !== null && event.payload.requestEventId !== undefined) {
        if (!state.adjustmentRequestEventIds.has(event.payload.requestEventId)) {
          return requestNotFound(event);
        }
      }
      const currentBalance = state.personBalances.get(event.payload.personId) ?? 0;
      if (currentBalance + event.payload.deltaPoints < 0) {
        return insufficientPoints(event);
      }
      return { status: "accepted" };
    }
    case "conflict.detected": {
      if (state.conflictIds.has(event.payload.conflictId)) {
        return entityAlreadyExists(event);
      }
      for (const detectedEventId of event.payload.detectedEventIds) {
        if (!state.knownEventIds.has(detectedEventId)) {
          return entityNotFound(event);
        }
      }
      return { status: "accepted" };
    }
    case "conflict.resolved": {
      if (!state.conflictIds.has(event.payload.conflictId)) {
        return conflictNotFound(event);
      }
      if (event.payload.resolvedEventId !== null && event.payload.resolvedEventId !== undefined) {
        if (!state.knownEventIds.has(event.payload.resolvedEventId)) {
          return entityNotFound(event);
        }
      }
      if (event.payload.relatedEventIds !== null && event.payload.relatedEventIds !== undefined) {
        for (const relatedEventId of event.payload.relatedEventIds) {
          if (!state.knownEventIds.has(relatedEventId)) {
            return entityNotFound(event);
          }
        }
      }
      return { status: "accepted" };
    }
    default:
      return {
        status: "rejected",
        reason: "UNSUPPORTED_MERGE_STATE",
      };
  }
};

export const applyAcceptedIncomingEvent = (state: MergeState, event: Event): void => {
  applyStateMutation(state, event, {
    source: "batch",
    eventId: event.eventId,
  });
};
