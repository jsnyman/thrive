import { createPasscodeHash, verifyPasscode } from "../auth";
import type { Prisma } from "@prisma/client";

export type SeedUser = {
  username: string;
  passcode: string;
  role: "collector" | "shop_operator" | "manager";
};

export const defaultSeedUsers: SeedUser[] = [
  {
    username: "manager",
    passcode: "1234",
    role: "manager",
  },
  {
    username: "collector",
    passcode: "1234",
    role: "collector",
  },
  {
    username: "operator",
    passcode: "1234",
    role: "shop_operator",
  },
];

export const parseSeedUsers = (input: string | undefined): SeedUser[] => {
  if (input === undefined || input.trim().length === 0) {
    return defaultSeedUsers;
  }
  const parsed = JSON.parse(input) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("STAFF_SEED_JSON must be a JSON array");
  }
  const users: SeedUser[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Each STAFF_SEED_JSON entry must be an object");
    }
    const record = entry as Record<string, unknown>;
    const username = record["username"];
    const passcode = record["passcode"];
    const role = record["role"];
    if (typeof username !== "string" || username.trim().length === 0) {
      throw new Error("Seed username must be a non-empty string");
    }
    if (typeof passcode !== "string" || passcode.trim().length === 0) {
      throw new Error("Seed passcode must be a non-empty string");
    }
    if (role !== "collector" && role !== "shop_operator" && role !== "manager") {
      throw new Error("Seed role must be collector, shop_operator, or manager");
    }
    users.push({
      username,
      passcode,
      role,
    });
  }
  return users;
};

type StaffUserWriter = {
  staffUser: {
    upsert: (args: Prisma.StaffUserUpsertArgs) => Promise<unknown>;
  };
};

export const seedStaffUsers = async (prisma: StaffUserWriter, users: SeedUser[]): Promise<void> => {
  for (const user of users) {
    const passcodeHash = createPasscodeHash(user.passcode);
    await prisma.staffUser.upsert({
      where: {
        username: user.username,
      },
      update: {
        passcodeHash,
        role: user.role,
      },
      create: {
        username: user.username,
        passcodeHash,
        role: user.role,
      },
    });
  }
};

export const verifySeedHash = (passcode: string, passcodeHash: string): boolean =>
  verifyPasscode(passcode, passcodeHash);
