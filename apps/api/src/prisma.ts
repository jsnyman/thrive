import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

const envCandidatePaths = [join(process.cwd(), "apps", "api", ".env"), join(process.cwd(), ".env")];

for (const envPath of envCandidatePaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
    break;
  }
}

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required to create PrismaClient.");
  }
  return databaseUrl;
};

// Factory to keep lifecycle ownership with the caller; avoids global mutable state.
export const createPrismaClient = (options?: PrismaClientOptions): PrismaClient => {
  const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  return new PrismaClient({ ...(options ?? {}), adapter });
};
