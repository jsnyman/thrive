import type { PrismaClient } from "../generated/prisma/client";
import type { StaffUserRecord } from "./types";

export const getStaffUserByUsername = async (
  prisma: PrismaClient,
  username: string,
): Promise<StaffUserRecord | null> => {
  const user = await prisma.staffUser.findUnique({
    where: {
      username,
    },
  });
  if (user === null) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    passcodeHash: user.passcodeHash,
    role: user.role,
  };
};
