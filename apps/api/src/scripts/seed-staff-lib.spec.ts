import { parseSeedUsers, seedStaffUsers, verifySeedHash } from "./seed-staff-lib";

describe("parseSeedUsers", () => {
  test("returns default users when env input is missing", () => {
    const users = parseSeedUsers(undefined);
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]?.username).toBe("administrator");
  });

  test("parses explicit seed json", () => {
    const users = parseSeedUsers(
      JSON.stringify([{ username: "ops", passcode: "4567", role: "user" }]),
    );
    expect(users).toEqual([{ username: "ops", passcode: "4567", role: "user" }]);
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
      [{ username: "administrator", passcode: "1234", role: "administrator" }],
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
