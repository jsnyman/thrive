import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthConfig, AuthTokenClaims, Result } from "./types";

type TokenError = "INVALID_TOKEN" | "EXPIRED_TOKEN";

const encodeBase64Url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const decodeBase64Url = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const toJson = (value: unknown): string => JSON.stringify(value);

const sign = (input: string, secret: string): Buffer =>
  createHmac("sha256", secret).update(input).digest();

const parseClaims = (value: string): AuthTokenClaims | null => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const sub = parsed["sub"];
    const username = parsed["username"];
    const role = parsed["role"];
    const iat = parsed["iat"];
    const exp = parsed["exp"];
    if (
      typeof sub !== "string" ||
      typeof username !== "string" ||
      typeof role !== "string" ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    ) {
      return null;
    }
    if (role !== "user" && role !== "administrator") {
      return null;
    }
    return {
      sub,
      username,
      role,
      iat,
      exp,
    };
  } catch {
    return null;
  }
};

export const issueAuthToken = (
  claims: Omit<AuthTokenClaims, "iat" | "exp">,
  config: AuthConfig,
  now: Date,
): string => {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + config.tokenTtlSeconds;
  const payload: AuthTokenClaims = {
    ...claims,
    iat: issuedAt,
    exp: expiresAt,
  };
  const header = encodeBase64Url(toJson({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(toJson(payload));
  const signedContent = `${header}.${body}`;
  const signature = sign(signedContent, config.secret).toString("base64url");
  return `${signedContent}.${signature}`;
};

export const verifyAuthToken = (
  token: string,
  config: AuthConfig,
  now: Date,
): Result<AuthTokenClaims, TokenError> => {
  const segments = token.split(".");
  if (segments.length !== 3) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  const header = segments[0];
  const body = segments[1];
  const signature = segments[2];
  if (header === undefined || body === undefined || signature === undefined) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  if (header.length === 0 || body.length === 0 || signature.length === 0) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  const signedContent = `${header}.${body}`;
  const expectedSignature = sign(signedContent, config.secret);
  const actualSignature = Buffer.from(signature, "base64url");
  if (expectedSignature.length !== actualSignature.length) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  const claimsJson = decodeBase64Url(body);
  const claims = parseClaims(claimsJson);
  if (claims === null) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds >= claims.exp) {
    return { ok: false, error: "EXPIRED_TOKEN" };
  }
  return { ok: true, value: claims };
};
