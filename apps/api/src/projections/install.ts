import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "../prisma";
import { refreshProjections } from "./refresh";

const loadProjectionSql = async (): Promise<string> => {
  const sqlPath = join(process.cwd(), "apps", "api", "prisma", "projections.sql");
  return readFile(sqlPath, "utf8");
};

const run = async (): Promise<void> => {
  const prisma = createPrismaClient();
  try {
    const sql = await loadProjectionSql();
    await prisma.$executeRawUnsafe(sql);
    await refreshProjections(prisma);
  } finally {
    await prisma.$disconnect();
  }
};

void run();
