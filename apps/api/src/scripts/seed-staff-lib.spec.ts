import { parseSeedUsers, seedStaffUsers, verifySeedHash } from "./seed-staff-lib";

describe("parseSeedUsers", () => {
  test("returns default users when env input is missing", () => {
    const users = parseSeedUsers(undefined);
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]?.username).toBe("manager");
  });

  test("parses explicit seed json", () => {
    const users = parseSeedUsers(
      JSON.stringify([{ username: "ops", passcode: "4567", role: "shop_operator" }]),
    );
    expect(users).toEqual([{ username: "ops", passcode: "4567", role: "shop_operator" }]);
  });
});

describe("seedStaffUsers", () => {
  test("writes hashed passcodes via upsert", async () => {
    const capturedHashes: string[] = [];
    await seedStaffUsers(
      {
        staffUser: {
          upsert: async (args) => {
            capturedHashes.push(args.create.passcodeHash);
            return {};
          },
        },
      },
      [{ username: "manager", passcode: "1234", role: "manager" }],
    );

    expect(capturedHashes).toHaveLength(1);
    const hash = capturedHashes[0];
    if (hash === undefined) {
      throw new Error("Expected captured hash");
    }
    expect(hash).not.toBe("1234");
    expect(verifySeedHash("1234", hash)).toBe(true);
  });
});
