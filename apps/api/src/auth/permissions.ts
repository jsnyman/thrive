import type { StaffRole } from "../../../../packages/shared/src/domain/types";
import type { PermissionAction } from "./types";

const permissionMap: Record<StaffRole, PermissionAction[]> = {
  user: [
    "person.read",
    "person.create",
    "person.update",
    "intake.record",
    "sale.record",
    "inventory.read",
    "points.adjustment.request",
    "inventory.adjustment.request",
  ],
  administrator: [
    "person.read",
    "person.create",
    "person.update",
    "intake.record",
    "sale.record",
    "inventory.read",
    "inventory.move",
    "item.manage",
    "procurement.record",
    "expense.record",
    "reports.view",
    "points.adjustment.request",
    "points.adjustment.apply",
    "inventory.adjustment.request",
    "inventory.adjustment.apply",
    "conflict.view",
    "conflict.resolve",
    "audit.view",
    "users.manage",
  ],
};

export const authorizeStaffAction = (role: StaffRole, action: PermissionAction): boolean => {
  const allowedActions = permissionMap[role];
  return allowedActions.includes(action);
};
