import type { StaffRole } from "../../../../packages/shared/src/domain/types";
import type { PermissionAction } from "./types";

const permissionMap: Record<StaffRole, PermissionAction[]> = {
  collector: [
    "person.create",
    "person.update",
    "intake.record",
    "points.adjustment.request",
    "inventory.adjustment.request",
  ],
  shop_operator: [
    "person.create",
    "person.update",
    "sale.record",
    "inventory.move",
    "points.adjustment.request",
    "inventory.adjustment.request",
  ],
  manager: [
    "person.create",
    "person.update",
    "intake.record",
    "sale.record",
    "inventory.move",
    "item.manage",
    "procurement.record",
    "expense.record",
    "reports.view",
    "points.adjustment.request",
    "points.adjustment.apply",
    "inventory.adjustment.request",
    "inventory.adjustment.apply",
    "users.manage",
  ],
};

export const authorizeStaffAction = (role: StaffRole, action: PermissionAction): boolean => {
  const allowedActions = permissionMap[role];
  return allowedActions.includes(action);
};
