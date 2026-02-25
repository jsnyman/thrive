import { PrismaClient } from "@prisma/client";

// Factory to keep lifecycle ownership with the caller; avoids global mutable state.
export const createPrismaClient = (): PrismaClient => new PrismaClient();
