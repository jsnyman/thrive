import type {
  Event,
  EventEnvelope,
  EventPayloadMap,
  EventType,
  EventSchemaVersion,
} from "./events";
import {
  floorPointsToTenths,
  isTenthsPointValue,
  multiplyPointValue,
  sumPointValues,
  toPointTenths,
} from "./points";
import type { InventoryAdjustmentStatus, InventoryStatus, StaffRole } from "./types";

type ValidationIssue = { path: string; message: string };

export type { ValidationIssue };

export type ValidationOk<T> = { ok: true; value: T };
export type ValidationFail = { ok: false; issues: ValidationIssue[] };
export type ValidationResult<T> = ValidationOk<T> | ValidationFail;

const ok = <T>(value: T): ValidationOk<T> => ({ ok: true, value });
const fail = (issues: ValidationIssue[]): ValidationFail => ({ ok: false, issues });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isInteger = (value: unknown): value is number => isNumber(value) && Number.isInteger(value);

const isIsoDateTime = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value));

const addIssue = (issues: ValidationIssue[], path: string, message: string) => {
  issues.push({ path, message });
};

const expectRecord = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    addIssue(issues, path, "Expected object");
    return false;
  }
  return true;
};

const expectString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options?: { allowEmpty?: boolean },
): value is string => {
  if (!isString(value)) {
    addIssue(issues, path, "Expected string");
    return false;
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    addIssue(issues, path, "Expected non-empty string");
    return false;
  }
  return true;
};

const expectNullableString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options?: { allowEmpty?: boolean },
): value is string | null | undefined => {
  if (value === undefined || value === null) {
    return true;
  }
  return expectString(value, path, issues, options);
};

const expectNumber = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options?: { integer?: boolean; min?: number },
): value is number => {
  if (!isNumber(value)) {
    addIssue(issues, path, "Expected number");
    return false;
  }
  if (options?.integer && !Number.isInteger(value)) {
    addIssue(issues, path, "Expected integer");
    return false;
  }
  if (options?.min !== undefined && value < options.min) {
    addIssue(issues, path, `Expected number >= ${options.min}`);
    return false;
  }
  return true;
};

const expectTenthsPointNumber = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options?: { min?: number },
): value is number => {
  if (!expectNumber(value, path, issues, options)) {
    return false;
  }
  if (!isTenthsPointValue(value)) {
    addIssue(issues, path, "Expected point value with at most one decimal place");
    return false;
  }
  return true;
};

const expectIsoDateTime = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is string => {
  if (!isIsoDateTime(value)) {
    addIssue(issues, path, "Expected ISO date-time string");
    return false;
  }
  return true;
};

const expectArray = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is unknown[] => {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "Expected array");
    return false;
  }
  return true;
};

const INVENTORY_STATUSES: InventoryStatus[] = [
  "storage",
  "shop",
  "sold",
  "spoiled",
  "damaged",
  "missing",
];

const INVENTORY_ADJUSTMENT_STATUSES: InventoryAdjustmentStatus[] = [
  "spoiled",
  "damaged",
  "missing",
];

const STAFF_ROLES: StaffRole[] = ["user", "administrator"];

const EVENT_TYPES: EventType[] = [
  "person.created",
  "person.profile_updated",
  "material_type.created",
  "material_type.updated",
  "item.created",
  "item.updated",
  "staff_user.created",
  "staff_user.role_changed",
  "intake.recorded",
  "sale.recorded",
  "procurement.recorded",
  "expense.recorded",
  "inventory.status_changed",
  "inventory.adjustment_requested",
  "inventory.adjustment_applied",
  "points.adjustment_requested",
  "points.adjustment_applied",
  "conflict.detected",
  "conflict.resolved",
];

export const isEventType = (value: unknown): value is EventType =>
  isString(value) && EVENT_TYPES.includes(value as EventType);

export const isInventoryStatus = (value: unknown): value is InventoryStatus =>
  isString(value) && INVENTORY_STATUSES.includes(value as InventoryStatus);

export const isInventoryAdjustmentStatus = (value: unknown): value is InventoryAdjustmentStatus =>
  isString(value) && INVENTORY_ADJUSTMENT_STATUSES.includes(value as InventoryAdjustmentStatus);

export const isStaffRole = (value: unknown): value is StaffRole =>
  isString(value) && STAFF_ROLES.includes(value as StaffRole);

const validatePersonCreatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["person.created"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.personId, `${path}.personId`, issues);
  expectString(payload.name, `${path}.name`, issues);
  expectString(payload.surname, `${path}.surname`, issues);
  expectNullableString(payload.idNumber, `${path}.idNumber`, issues);
  expectNullableString(payload.phone, `${path}.phone`, issues);
  expectNullableString(payload.address, `${path}.address`, issues);
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validatePersonProfileUpdatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["person.profile_updated"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.personId, `${path}.personId`, issues);
  if (!expectRecord(payload.updates, `${path}.updates`, issues)) {
    return false;
  }
  const updates = payload.updates;
  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) {
    addIssue(issues, `${path}.updates`, "Expected at least one field to update");
  }
  if ("name" in updates) {
    expectString(updates.name, `${path}.updates.name`, issues);
  }
  if ("surname" in updates) {
    expectString(updates.surname, `${path}.updates.surname`, issues);
  }
  if ("idNumber" in updates) {
    expectNullableString(updates.idNumber, `${path}.updates.idNumber`, issues);
  }
  if ("phone" in updates) {
    expectNullableString(updates.phone, `${path}.updates.phone`, issues);
  }
  if ("address" in updates) {
    expectNullableString(updates.address, `${path}.updates.address`, issues);
  }
  if ("notes" in updates) {
    expectNullableString(updates.notes, `${path}.updates.notes`, issues, { allowEmpty: true });
  }
  return true;
};

const validateMaterialTypeCreatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["material_type.created"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.materialTypeId, `${path}.materialTypeId`, issues);
  expectString(payload.name, `${path}.name`, issues);
  expectTenthsPointNumber(payload.pointsPerKg, `${path}.pointsPerKg`, issues, { min: 0 });
  return true;
};

const validateMaterialTypeUpdatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["material_type.updated"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.materialTypeId, `${path}.materialTypeId`, issues);
  if (!expectRecord(payload.updates, `${path}.updates`, issues)) {
    return false;
  }
  const updates = payload.updates;
  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) {
    addIssue(issues, `${path}.updates`, "Expected at least one field to update");
  }
  if ("name" in updates) {
    expectString(updates.name, `${path}.updates.name`, issues);
  }
  if ("pointsPerKg" in updates) {
    expectTenthsPointNumber(updates.pointsPerKg, `${path}.updates.pointsPerKg`, issues, { min: 0 });
  }
  return true;
};

const validateItemCreatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["item.created"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.itemId, `${path}.itemId`, issues);
  expectString(payload.name, `${path}.name`, issues);
  expectTenthsPointNumber(payload.pointsPrice, `${path}.pointsPrice`, issues, { min: 0 });
  if (payload.costPrice !== undefined && payload.costPrice !== null) {
    expectNumber(payload.costPrice, `${path}.costPrice`, issues, { min: 0 });
  }
  expectNullableString(payload.sku, `${path}.sku`, issues, { allowEmpty: true });
  return true;
};

const validateItemUpdatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["item.updated"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.itemId, `${path}.itemId`, issues);
  if (!expectRecord(payload.updates, `${path}.updates`, issues)) {
    return false;
  }
  const updates = payload.updates;
  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) {
    addIssue(issues, `${path}.updates`, "Expected at least one field to update");
  }
  if ("name" in updates) {
    expectString(updates.name, `${path}.updates.name`, issues);
  }
  if ("pointsPrice" in updates) {
    expectTenthsPointNumber(updates.pointsPrice, `${path}.updates.pointsPrice`, issues, { min: 0 });
  }
  if ("costPrice" in updates) {
    if (updates.costPrice !== undefined && updates.costPrice !== null) {
      expectNumber(updates.costPrice, `${path}.updates.costPrice`, issues, { min: 0 });
    }
  }
  if ("sku" in updates) {
    expectNullableString(updates.sku, `${path}.updates.sku`, issues, { allowEmpty: true });
  }
  return true;
};

const validateStaffUserCreatedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["staff_user.created"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.userId, `${path}.userId`, issues);
  expectString(payload.username, `${path}.username`, issues);
  if (!isStaffRole(payload.role)) {
    addIssue(issues, `${path}.role`, "Expected staff role");
  }
  return true;
};

const validateStaffUserRoleChangedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["staff_user.role_changed"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.userId, `${path}.userId`, issues);
  if (
    payload.fromRole !== undefined &&
    payload.fromRole !== null &&
    !isStaffRole(payload.fromRole)
  ) {
    addIssue(issues, `${path}.fromRole`, "Expected staff role");
  }
  if (!isStaffRole(payload.toRole)) {
    addIssue(issues, `${path}.toRole`, "Expected staff role");
  }
  if (payload.fromRole !== undefined && payload.fromRole === payload.toRole) {
    addIssue(issues, `${path}.toRole`, "Expected role change to be different");
  }
  return true;
};

const validateIntakeRecordedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["intake.recorded"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.personId, `${path}.personId`, issues);
  if (expectArray(payload.lines, `${path}.lines`, issues)) {
    if (payload.lines.length === 0) {
      addIssue(issues, `${path}.lines`, "Expected at least one intake line");
    }
    const computedPoints: number[] = [];
    payload.lines.forEach((line, index) => {
      const linePath = `${path}.lines[${index}]`;
      if (!expectRecord(line, linePath, issues)) {
        return;
      }
      expectString(line.materialTypeId, `${linePath}.materialTypeId`, issues);
      expectNumber(line.weightKg, `${linePath}.weightKg`, issues, { min: 0 });
      if (isNumber(line.weightKg) && line.weightKg <= 0) {
        addIssue(issues, `${linePath}.weightKg`, "Expected weight > 0");
      }
      expectTenthsPointNumber(line.pointsPerKg, `${linePath}.pointsPerKg`, issues, { min: 0 });
      expectTenthsPointNumber(line.pointsAwarded, `${linePath}.pointsAwarded`, issues, { min: 0 });
      if (isNumber(line.weightKg) && isNumber(line.pointsPerKg) && isNumber(line.pointsAwarded)) {
        const expected = floorPointsToTenths(line.weightKg * line.pointsPerKg);
        if (line.pointsAwarded !== expected) {
          addIssue(
            issues,
            `${linePath}.pointsAwarded`,
            `Expected pointsAwarded to equal floor-to-tenths(weightKg * pointsPerKg) = ${expected}`,
          );
        }
      }
      if (isNumber(line.pointsAwarded) && isTenthsPointValue(line.pointsAwarded)) {
        computedPoints.push(line.pointsAwarded);
      }
    });
    if (isNumber(payload.totalPoints) && isTenthsPointValue(payload.totalPoints)) {
      const computedTotal = sumPointValues(computedPoints);
      if (payload.totalPoints !== computedTotal) {
        addIssue(
          issues,
          `${path}.totalPoints`,
          `Expected totalPoints to equal sum of lines = ${computedTotal}`,
        );
      }
    }
  }
  expectTenthsPointNumber(payload.totalPoints, `${path}.totalPoints`, issues, { min: 0 });
  return true;
};

const validateSaleRecordedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["sale.recorded"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.personId, `${path}.personId`, issues);
  if (expectArray(payload.lines, `${path}.lines`, issues)) {
    if (payload.lines.length === 0) {
      addIssue(issues, `${path}.lines`, "Expected at least one sale line");
    }
    const computedPoints: number[] = [];
    payload.lines.forEach((line, index) => {
      const linePath = `${path}.lines[${index}]`;
      if (!expectRecord(line, linePath, issues)) {
        return;
      }
      expectString(line.itemId, `${linePath}.itemId`, issues);
      expectNullableString(line.inventoryBatchId, `${linePath}.inventoryBatchId`, issues);
      expectNumber(line.quantity, `${linePath}.quantity`, issues, { integer: true, min: 0 });
      if (isInteger(line.quantity) && line.quantity <= 0) {
        addIssue(issues, `${linePath}.quantity`, "Expected quantity > 0");
      }
      expectTenthsPointNumber(line.pointsPrice, `${linePath}.pointsPrice`, issues, { min: 0 });
      expectTenthsPointNumber(line.lineTotalPoints, `${linePath}.lineTotalPoints`, issues, {
        min: 0,
      });
      if (
        isInteger(line.quantity) &&
        isNumber(line.pointsPrice) &&
        isNumber(line.lineTotalPoints)
      ) {
        const expected = multiplyPointValue(line.pointsPrice, line.quantity);
        if (line.lineTotalPoints !== expected) {
          addIssue(
            issues,
            `${linePath}.lineTotalPoints`,
            `Expected lineTotalPoints to equal quantity * pointsPrice = ${expected}`,
          );
        }
      }
      if (isNumber(line.lineTotalPoints) && isTenthsPointValue(line.lineTotalPoints)) {
        computedPoints.push(line.lineTotalPoints);
      }
    });
    if (isNumber(payload.totalPoints) && isTenthsPointValue(payload.totalPoints)) {
      const computedTotal = sumPointValues(computedPoints);
      if (payload.totalPoints !== computedTotal) {
        addIssue(
          issues,
          `${path}.totalPoints`,
          `Expected totalPoints to equal sum of lines = ${computedTotal}`,
        );
      }
    }
  }
  expectTenthsPointNumber(payload.totalPoints, `${path}.totalPoints`, issues, { min: 0 });
  return true;
};

const validateProcurementRecordedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["procurement.recorded"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectNullableString(payload.supplierName, `${path}.supplierName`, issues);
  if (payload.tripDistanceKm !== undefined && payload.tripDistanceKm !== null) {
    expectNumber(payload.tripDistanceKm, `${path}.tripDistanceKm`, issues, { min: 0 });
  }
  expectNumber(payload.cashTotal, `${path}.cashTotal`, issues, { min: 0 });
  if (expectArray(payload.lines, `${path}.lines`, issues)) {
    if (payload.lines.length === 0) {
      addIssue(issues, `${path}.lines`, "Expected at least one procurement line");
    }
    let computedTotal = 0;
    payload.lines.forEach((line, index) => {
      const linePath = `${path}.lines[${index}]`;
      if (!expectRecord(line, linePath, issues)) {
        return;
      }
      expectString(line.itemId, `${linePath}.itemId`, issues);
      expectString(line.inventoryBatchId, `${linePath}.inventoryBatchId`, issues);
      expectNumber(line.quantity, `${linePath}.quantity`, issues, { integer: true, min: 0 });
      if (isInteger(line.quantity) && line.quantity <= 0) {
        addIssue(issues, `${linePath}.quantity`, "Expected quantity > 0");
      }
      expectNumber(line.unitCost, `${linePath}.unitCost`, issues, { min: 0 });
      expectNumber(line.lineTotalCost, `${linePath}.lineTotalCost`, issues, { min: 0 });
      if (isInteger(line.quantity) && isNumber(line.unitCost) && isNumber(line.lineTotalCost)) {
        const expected = line.quantity * line.unitCost;
        if (line.lineTotalCost !== expected) {
          addIssue(
            issues,
            `${linePath}.lineTotalCost`,
            `Expected lineTotalCost to equal quantity * unitCost = ${expected}`,
          );
        }
      }
      if (isNumber(line.lineTotalCost)) {
        computedTotal += line.lineTotalCost;
      }
    });
    if (isNumber(payload.cashTotal) && computedTotal !== payload.cashTotal) {
      addIssue(
        issues,
        `${path}.cashTotal`,
        `Expected cashTotal to equal sum of lines = ${computedTotal}`,
      );
    }
  }
  return true;
};

const validateExpenseRecordedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["expense.recorded"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.category, `${path}.category`, issues);
  expectNumber(payload.cashAmount, `${path}.cashAmount`, issues, { min: 0 });
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  expectNullableString(payload.receiptRef, `${path}.receiptRef`, issues);
  return true;
};

const validateInventoryStatusChangedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["inventory.status_changed"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.inventoryBatchId, `${path}.inventoryBatchId`, issues);
  if (!isInventoryStatus(payload.fromStatus)) {
    addIssue(issues, `${path}.fromStatus`, "Expected inventory status");
  }
  if (!isInventoryStatus(payload.toStatus)) {
    addIssue(issues, `${path}.toStatus`, "Expected inventory status");
  }
  if (payload.fromStatus === payload.toStatus) {
    addIssue(issues, `${path}.toStatus`, "Expected status change to be different");
  }
  expectNumber(payload.quantity, `${path}.quantity`, issues, { integer: true, min: 0 });
  if (isInteger(payload.quantity) && payload.quantity <= 0) {
    addIssue(issues, `${path}.quantity`, "Expected quantity > 0");
  }
  expectNullableString(payload.reason, `${path}.reason`, issues, { allowEmpty: true });
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validateInventoryAdjustmentRequestedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["inventory.adjustment_requested"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.inventoryBatchId, `${path}.inventoryBatchId`, issues);
  if (!isInventoryAdjustmentStatus(payload.requestedStatus)) {
    addIssue(issues, `${path}.requestedStatus`, "Expected inventory adjustment status");
  }
  expectNumber(payload.quantity, `${path}.quantity`, issues, { integer: true, min: 0 });
  if (isInteger(payload.quantity) && payload.quantity <= 0) {
    addIssue(issues, `${path}.quantity`, "Expected quantity > 0");
  }
  expectString(payload.reason, `${path}.reason`, issues);
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validateInventoryAdjustmentAppliedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["inventory.adjustment_applied"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectNullableString(payload.requestEventId, `${path}.requestEventId`, issues);
  expectString(payload.inventoryBatchId, `${path}.inventoryBatchId`, issues);
  if (!isInventoryStatus(payload.fromStatus)) {
    addIssue(issues, `${path}.fromStatus`, "Expected inventory status");
  }
  if (!isInventoryStatus(payload.toStatus)) {
    addIssue(issues, `${path}.toStatus`, "Expected inventory status");
  }
  if (payload.fromStatus === payload.toStatus) {
    addIssue(issues, `${path}.toStatus`, "Expected status change to be different");
  }
  expectNumber(payload.quantity, `${path}.quantity`, issues, { integer: true, min: 0 });
  if (isInteger(payload.quantity) && payload.quantity <= 0) {
    addIssue(issues, `${path}.quantity`, "Expected quantity > 0");
  }
  expectString(payload.reason, `${path}.reason`, issues);
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validatePointsAdjustmentRequestedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["points.adjustment_requested"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.personId, `${path}.personId`, issues);
  expectTenthsPointNumber(payload.deltaPoints, `${path}.deltaPoints`, issues);
  if (isNumber(payload.deltaPoints) && toPointTenths(payload.deltaPoints) === 0) {
    addIssue(issues, `${path}.deltaPoints`, "Expected deltaPoints to be non-zero");
  }
  expectString(payload.reason, `${path}.reason`, issues);
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validatePointsAdjustmentAppliedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["points.adjustment_applied"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectNullableString(payload.requestEventId, `${path}.requestEventId`, issues);
  expectString(payload.personId, `${path}.personId`, issues);
  expectTenthsPointNumber(payload.deltaPoints, `${path}.deltaPoints`, issues);
  if (isNumber(payload.deltaPoints) && toPointTenths(payload.deltaPoints) === 0) {
    addIssue(issues, `${path}.deltaPoints`, "Expected deltaPoints to be non-zero");
  }
  expectString(payload.reason, `${path}.reason`, issues);
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

const validateConflictDetectedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["conflict.detected"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.conflictId, `${path}.conflictId`, issues);
  if (
    payload.entityType !== "person" &&
    payload.entityType !== "intake" &&
    payload.entityType !== "sale" &&
    payload.entityType !== "procurement" &&
    payload.entityType !== "expense" &&
    payload.entityType !== "inventory_batch" &&
    payload.entityType !== "points_ledger"
  ) {
    addIssue(issues, `${path}.entityType`, "Expected valid entity type");
  }
  expectString(payload.entityId, `${path}.entityId`, issues);
  if (expectArray(payload.detectedEventIds, `${path}.detectedEventIds`, issues)) {
    if (payload.detectedEventIds.length === 0) {
      addIssue(issues, `${path}.detectedEventIds`, "Expected at least one event id");
    }
    payload.detectedEventIds.forEach((eventId, index) => {
      expectString(eventId, `${path}.detectedEventIds[${index}]`, issues);
    });
  }
  expectNullableString(payload.summary, `${path}.summary`, issues, { allowEmpty: true });
  return true;
};

const validateConflictResolvedPayload = (
  payload: unknown,
  issues: ValidationIssue[],
  path: string,
): payload is EventPayloadMap["conflict.resolved"] => {
  if (!expectRecord(payload, path, issues)) {
    return false;
  }
  expectString(payload.conflictId, `${path}.conflictId`, issues);
  if (
    payload.resolution !== "accepted" &&
    payload.resolution !== "rejected" &&
    payload.resolution !== "merged"
  ) {
    addIssue(issues, `${path}.resolution`, "Expected resolution of accepted, rejected, or merged");
  }
  expectNullableString(payload.resolvedEventId, `${path}.resolvedEventId`, issues);
  if (payload.relatedEventIds !== undefined && payload.relatedEventIds !== null) {
    if (expectArray(payload.relatedEventIds, `${path}.relatedEventIds`, issues)) {
      payload.relatedEventIds.forEach((eventId, index) => {
        expectString(eventId, `${path}.relatedEventIds[${index}]`, issues);
      });
    }
  }
  expectNullableString(payload.notes, `${path}.notes`, issues, { allowEmpty: true });
  return true;
};

export const validateEventPayload = <T extends EventType>(
  eventType: T,
  payload: unknown,
): ValidationResult<EventPayloadMap[T]> => {
  const issues: ValidationIssue[] = [];
  switch (eventType) {
    case "person.created":
      validatePersonCreatedPayload(payload, issues, "payload");
      break;
    case "person.profile_updated":
      validatePersonProfileUpdatedPayload(payload, issues, "payload");
      break;
    case "material_type.created":
      validateMaterialTypeCreatedPayload(payload, issues, "payload");
      break;
    case "material_type.updated":
      validateMaterialTypeUpdatedPayload(payload, issues, "payload");
      break;
    case "item.created":
      validateItemCreatedPayload(payload, issues, "payload");
      break;
    case "item.updated":
      validateItemUpdatedPayload(payload, issues, "payload");
      break;
    case "staff_user.created":
      validateStaffUserCreatedPayload(payload, issues, "payload");
      break;
    case "staff_user.role_changed":
      validateStaffUserRoleChangedPayload(payload, issues, "payload");
      break;
    case "intake.recorded":
      validateIntakeRecordedPayload(payload, issues, "payload");
      break;
    case "sale.recorded":
      validateSaleRecordedPayload(payload, issues, "payload");
      break;
    case "procurement.recorded":
      validateProcurementRecordedPayload(payload, issues, "payload");
      break;
    case "expense.recorded":
      validateExpenseRecordedPayload(payload, issues, "payload");
      break;
    case "inventory.status_changed":
      validateInventoryStatusChangedPayload(payload, issues, "payload");
      break;
    case "inventory.adjustment_requested":
      validateInventoryAdjustmentRequestedPayload(payload, issues, "payload");
      break;
    case "inventory.adjustment_applied":
      validateInventoryAdjustmentAppliedPayload(payload, issues, "payload");
      break;
    case "points.adjustment_requested":
      validatePointsAdjustmentRequestedPayload(payload, issues, "payload");
      break;
    case "points.adjustment_applied":
      validatePointsAdjustmentAppliedPayload(payload, issues, "payload");
      break;
    case "conflict.detected":
      validateConflictDetectedPayload(payload, issues, "payload");
      break;
    case "conflict.resolved":
      validateConflictResolvedPayload(payload, issues, "payload");
      break;
    default:
      addIssue(issues, "eventType", "Unsupported event type");
  }
  if (issues.length > 0) {
    return fail(issues);
  }
  return ok(payload as EventPayloadMap[T]);
};

export const validateEventEnvelope = (value: unknown): ValidationResult<EventEnvelope> => {
  const issues: ValidationIssue[] = [];
  if (!expectRecord(value, "event", issues)) {
    return fail(issues);
  }

  expectString(value.eventId, "event.eventId", issues);
  if (!isEventType(value.eventType)) {
    addIssue(issues, "event.eventType", "Expected valid event type");
  }
  expectIsoDateTime(value.occurredAt, "event.occurredAt", issues);
  if (value.recordedAt !== undefined && value.recordedAt !== null) {
    expectIsoDateTime(value.recordedAt, "event.recordedAt", issues);
  }
  expectString(value.actorUserId, "event.actorUserId", issues);
  expectString(value.deviceId, "event.deviceId", issues);
  expectNullableString(value.locationText, "event.locationText", issues, { allowEmpty: true });
  const schemaVersion: EventSchemaVersion | undefined = value.schemaVersion as
    | EventSchemaVersion
    | undefined;
  if (schemaVersion !== 1) {
    addIssue(issues, "event.schemaVersion", "Expected schemaVersion to be 1");
  }
  expectNullableString(value.correlationId, "event.correlationId", issues);
  expectNullableString(value.causationId, "event.causationId", issues);
  if (!("payload" in value)) {
    addIssue(issues, "event.payload", "Missing payload");
  }

  if (issues.length > 0) {
    return fail(issues);
  }

  return ok(value as EventEnvelope);
};

export const validateEvent = (value: unknown): ValidationResult<Event> => {
  const envelopeResult = validateEventEnvelope(value);
  if (!envelopeResult.ok) {
    return envelopeResult;
  }
  const eventType = envelopeResult.value.eventType;
  if (!isEventType(eventType)) {
    return fail([{ path: "event.eventType", message: "Expected valid event type" }]);
  }
  const payloadResult = validateEventPayload(eventType, envelopeResult.value.payload);
  if (!payloadResult.ok) {
    return payloadResult;
  }
  return ok(envelopeResult.value as Event);
};

export const isEventEnvelope = (value: unknown): value is EventEnvelope =>
  validateEventEnvelope(value).ok;

export const isEvent = (value: unknown): value is Event => validateEvent(value).ok;
