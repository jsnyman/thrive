jest.mock("@prisma/adapter-pg", () => {
  return {
    PrismaPg: jest.fn().mockImplementation((options: { connectionString: string }) => options),
  };
});

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation((options: { adapter: unknown }) => options),
  };
});

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma";

describe("createPrismaClient", () => {
  test("constructs PrismaClient from @prisma/client with the pg adapter", () => {
    process.env["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/recycling?schema=public";

    const client = createPrismaClient();

    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: "postgresql://user:pass@localhost:5432/recycling?schema=public",
    });
    expect(PrismaClient).toHaveBeenCalledWith({
      adapter: {
        connectionString: "postgresql://user:pass@localhost:5432/recycling?schema=public",
      },
    });
    expect(client).toEqual({
      adapter: {
        connectionString: "postgresql://user:pass@localhost:5432/recycling?schema=public",
      },
    });
  });
});
