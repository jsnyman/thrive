import { createPrismaClient } from "../prisma";
import { parseSeedUsers, seedStaffUsers } from "./seed-staff-lib";

const run = async (): Promise<void> => {
  const users = parseSeedUsers(process.env["STAFF_SEED_JSON"]);
  const prisma = createPrismaClient();
  try {
    await seedStaffUsers(prisma, users);
  } finally {
    await prisma.$disconnect();
  }
};

void run();
