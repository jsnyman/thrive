import { PrismaClient } from "./generated/prisma/client";

export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

// Factory to keep lifecycle ownership with the caller; avoids global mutable state.
export const createPrismaClient = (options?: PrismaClientOptions): PrismaClient =>
  new PrismaClient(options ?? ({} as PrismaClientOptions));
