import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

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
