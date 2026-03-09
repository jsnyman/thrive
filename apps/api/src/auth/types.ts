import type { StaffRole, UserId } from "../../../../packages/shared/src/domain/types";

export type AuthConfig = {
  secret: string;
  tokenTtlSeconds: number;
};

export type StaffUserRecord = {
  id: UserId;
  username: string;
  passcodeHash: string;
  role: StaffRole;
};

export type StaffIdentity = {
  id: UserId;
  username: string;
  role: StaffRole;
};

export type LoginRequest = {
  username: string;
  passcode: string;
};

export type AuthError =
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_TOKEN"
  | "EXPIRED_TOKEN";

export type ResultOk<T> = { ok: true; value: T };
export type ResultErr<E> = { ok: false; error: E };
export type Result<T, E> = ResultOk<T> | ResultErr<E>;

export type AuthTokenClaims = {
  sub: UserId;
  username: string;
  role: StaffRole;
  iat: number;
  exp: number;
};

export type PermissionAction =
  | "person.create"
  | "person.update"
  | "intake.record"
  | "sale.record"
  | "inventory.move"
  | "item.manage"
  | "procurement.record"
  | "expense.record"
  | "reports.view"
  | "points.adjustment.request"
  | "points.adjustment.apply"
  | "inventory.adjustment.request"
  | "inventory.adjustment.apply"
  | "conflict.view"
  | "conflict.resolve"
  | "audit.view"
  | "users.manage";
