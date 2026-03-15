import { createPasscodeHash, verifyPasscode } from "./passcode";
import {
  authenticateStaffUser,
  authorizeStaffAction,
  createAuthorizationHeader,
  readAuthorizedActor,
  type AuthConfig,
  type StaffUserRecord,
} from "./index";

const config: AuthConfig = {
  secret: "test-secret",
  tokenTtlSeconds: 3600,
};

const now = new Date("2026-03-04T10:00:00.000Z");

const managerPasscode = "1234";
const managerHash = createPasscodeHash(managerPasscode);

const users: StaffUserRecord[] = [
  {
    id: "2772c203-5df5-4967-9341-09e391f4cb90",
    username: "manager",
    passcodeHash: managerHash,
    role: "manager",
  },
  {
    id: "4145d4dd-8421-4f5f-806b-fb4ccbd6596f",
    username: "collector",
    passcodeHash: createPasscodeHash("9999"),
    role: "collector",
  },
];

describe("passcode hashing", () => {
  test("verifies a matching passcode", () => {
    const hash = createPasscodeHash("6789");

    expect(verifyPasscode("6789", hash)).toBe(true);
  });

  test("rejects a non-matching passcode", () => {
    const hash = createPasscodeHash("6789");

    expect(verifyPasscode("1111", hash)).toBe(false);
  });
});

describe("staff authentication", () => {
  test("authenticates valid credentials and returns signed token", async () => {
    const result = await authenticateStaffUser(
      async (username) => users.find((user) => user.username === username) ?? null,
      { username: "manager", passcode: managerPasscode },
      config,
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected authentication success");
    }

    expect(result.value.user.username).toBe("manager");
    expect(result.value.user.role).toBe("manager");
    expect(result.value.token.length).toBeGreaterThan(0);
  });

  test("rejects invalid credentials", async () => {
    const result = await authenticateStaffUser(
      async (username) => users.find((user) => user.username === username) ?? null,
      { username: "manager", passcode: "bad-passcode" },
      config,
      now,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected authentication failure");
    }
    expect(result.error).toBe("INVALID_CREDENTIALS");
  });
});

describe("rbac authorization", () => {
  test("allows shop operator to read people", () => {
    const allowed = authorizeStaffAction("shop_operator", "person.read");

    expect(allowed).toBe(true);
  });

  test("denies collector from applying points adjustments", () => {
    const allowed = authorizeStaffAction("collector", "points.adjustment.apply");

    expect(allowed).toBe(false);
  });

  test("allows manager to apply points adjustments", () => {
    const allowed = authorizeStaffAction("manager", "points.adjustment.apply");

    expect(allowed).toBe(true);
  });
});

describe("authorization header parsing", () => {
  test("reads actor from valid bearer token", async () => {
    const auth = await authenticateStaffUser(
      async (username) => users.find((user) => user.username === username) ?? null,
      { username: "manager", passcode: managerPasscode },
      config,
      now,
    );

    if (!auth.ok) {
      throw new Error("Expected authentication success");
    }

    const actor = readAuthorizedActor(
      {
        authorization: createAuthorizationHeader(auth.value.token),
      },
      config,
      "inventory.adjustment.apply",
      now,
    );

    expect(actor.ok).toBe(true);
    if (!actor.ok) {
      throw new Error("Expected authorization success");
    }

    expect(actor.value.role).toBe("manager");
  });

  test("denies valid token when role lacks permission", async () => {
    const auth = await authenticateStaffUser(
      async (username) => users.find((user) => user.username === username) ?? null,
      { username: "collector", passcode: "9999" },
      config,
      now,
    );

    if (!auth.ok) {
      throw new Error("Expected authentication success");
    }

    const actor = readAuthorizedActor(
      {
        authorization: createAuthorizationHeader(auth.value.token),
      },
      config,
      "inventory.adjustment.apply",
      now,
    );

    expect(actor.ok).toBe(false);
    if (actor.ok) {
      throw new Error("Expected authorization failure");
    }
    expect(actor.error).toBe("FORBIDDEN");
  });
});
