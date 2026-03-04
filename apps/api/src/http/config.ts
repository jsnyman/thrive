import type { AuthConfig } from "../auth";

type ApiRuntimeConfig = {
  authConfig: AuthConfig;
  apiPort: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const DEFAULT_API_PORT = 3001;

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  envName: string,
): number => {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
};

export const readApiRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): ApiRuntimeConfig => {
  const secret = env["AUTH_SECRET"];
  if (secret === undefined || secret.length === 0) {
    throw new Error("Missing AUTH_SECRET environment variable");
  }

  const tokenTtlSeconds = parsePositiveInteger(
    env["AUTH_TOKEN_TTL_SECONDS"],
    DEFAULT_TOKEN_TTL_SECONDS,
    "AUTH_TOKEN_TTL_SECONDS",
  );
  const apiPort = parsePositiveInteger(env["API_PORT"], DEFAULT_API_PORT, "API_PORT");

  return {
    authConfig: {
      secret,
      tokenTtlSeconds,
    },
    apiPort,
  };
};
