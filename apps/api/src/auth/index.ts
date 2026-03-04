import { authorizeStaffAction } from "./permissions";
import { verifyPasscode } from "./passcode";
import { issueAuthToken, verifyAuthToken } from "./token";
import type {
  AuthConfig,
  AuthError,
  LoginRequest,
  PermissionAction,
  Result,
  StaffIdentity,
  StaffUserRecord,
} from "./types";

type GetStaffUserByUsername = (username: string) => Promise<StaffUserRecord | null>;
type RequestHeaders = Record<string, string | undefined>;

export type {
  AuthConfig,
  AuthError,
  LoginRequest,
  PermissionAction,
  Result,
  StaffIdentity,
  StaffUserRecord,
} from "./types";
export { authorizeStaffAction } from "./permissions";
export { createPasscodeHash, verifyPasscode } from "./passcode";

const invalidCredentials = <T>(): Result<T, AuthError> => ({
  ok: false,
  error: "INVALID_CREDENTIALS",
});

const toStaffIdentity = (user: StaffUserRecord): StaffIdentity => ({
  id: user.id,
  username: user.username,
  role: user.role,
});

export const authenticateStaffUser = async (
  getStaffUserByUsername: GetStaffUserByUsername,
  request: LoginRequest,
  config: AuthConfig,
  now: Date = new Date(),
): Promise<Result<{ user: StaffIdentity; token: string }, AuthError>> => {
  const user = await getStaffUserByUsername(request.username);
  if (user === null) {
    return invalidCredentials();
  }
  const passcodeOk = verifyPasscode(request.passcode, user.passcodeHash);
  if (!passcodeOk) {
    return invalidCredentials();
  }
  const identity = toStaffIdentity(user);
  const token = issueAuthToken(
    {
      sub: identity.id,
      username: identity.username,
      role: identity.role,
    },
    config,
    now,
  );
  return {
    ok: true,
    value: {
      user: identity,
      token,
    },
  };
};

const readBearerToken = (headers: RequestHeaders): Result<string, AuthError> => {
  const rawAuth = headers.authorization;
  if (rawAuth === undefined || rawAuth.trim().length === 0) {
    return { ok: false, error: "UNAUTHORIZED" };
  }
  const [scheme, token] = rawAuth.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.length === 0) {
    return { ok: false, error: "UNAUTHORIZED" };
  }
  return { ok: true, value: token };
};

export const createAuthorizationHeader = (token: string): string => `Bearer ${token}`;

export const readAuthorizedActor = (
  headers: RequestHeaders,
  config: AuthConfig,
  requiredAction: PermissionAction,
  now: Date = new Date(),
): Result<StaffIdentity, AuthError> => {
  const tokenResult = readBearerToken(headers);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const verified = verifyAuthToken(tokenResult.value, config, now);
  if (!verified.ok) {
    if (verified.error === "EXPIRED_TOKEN") {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    return { ok: false, error: "INVALID_TOKEN" };
  }
  const identity: StaffIdentity = {
    id: verified.value.sub,
    username: verified.value.username,
    role: verified.value.role,
  };
  const allowed = authorizeStaffAction(identity.role, requiredAction);
  if (!allowed) {
    return { ok: false, error: "FORBIDDEN" };
  }
  return { ok: true, value: identity };
};
