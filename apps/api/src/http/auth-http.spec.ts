import supertest = require("supertest");
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createPasscodeHash, type AuthConfig, type StaffUserRecord } from "../auth";
import { createApiServer, type ApiServerDependencies } from "./server";

const managerPasscode = "1234";
const collectorPasscode = "9999";

const users: StaffUserRecord[] = [
  {
    id: "2772c203-5df5-4967-9341-09e391f4cb90",
    username: "manager",
    passcodeHash: createPasscodeHash(managerPasscode),
    role: "manager",
  },
  {
    id: "4145d4dd-8421-4f5f-806b-fb4ccbd6596f",
    username: "collector",
    passcodeHash: createPasscodeHash(collectorPasscode),
    role: "collector",
  },
];

const authConfig: AuthConfig = {
  secret: "http-test-secret",
  tokenTtlSeconds: 3600,
};

const getUserByUsername = async (username: string): Promise<StaffUserRecord | null> =>
  users.find((user) => user.username === username) ?? null;

const defaultEvent: Event = {
  eventId: "7c5e6ab0-d172-47f7-b0ff-a2480f3d11b4",
  eventType: "person.created",
  occurredAt: "2026-03-05T10:00:00.000Z",
  recordedAt: "2026-03-05T10:00:01.000Z",
  actorUserId: users[0]?.id ?? "2772c203-5df5-4967-9341-09e391f4cb90",
  deviceId: "device-a",
  schemaVersion: 1,
  payload: {
    personId: "person-1",
    name: "stub",
    surname: "stub",
  },
};

const createDependencies = (overrides?: Partial<ApiServerDependencies>): ApiServerDependencies => ({
  authConfig,
  getStaffUserByUsername: getUserByUsername,
  listPeople: async () => [],
  listMaterials: async () => [],
  listItems: async () => [],
  listInventoryBatches: async () => [],
  listShopBatchesForItem: async () => [],
  listInventoryStatusSummary: async () => [],
  getPersonById: async () => null,
  getMaterialById: async () => null,
  getItemById: async () => null,
  getInventoryBatchState: async () => null,
  appendEventAndProject: async () => ({ status: "accepted" }),
  appendEvents: async (events) => events.map(() => ({ status: "accepted" })),
  listSyncConflicts: async () => ({
    conflicts: [],
    nextCursor: null,
  }),
  resolveSyncConflict: async () => ({
    ok: false,
    error: "CONFLICT_NOT_FOUND",
  }),
  listSyncAuditReport: async () => ({
    generatedAt: "2026-03-07T12:00:00.000Z",
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    issues: [],
    nextCursor: null,
  }),
  getSyncAuditEvent: async () => null,
  getLedgerBalance: async (personId) => ({
    personId,
    balancePoints: 0,
  }),
  listLedgerEntries: async () => [],
  getLivePointsBalance: async () => 0,
  pullEvents: async () => ({
    events: [defaultEvent],
    nextCursor: null,
  }),
  getSyncStatus: async () => ({
    latestCursor: null,
    projectionRefreshedAt: null,
    projectionCursor: null,
  }),
  ...overrides,
});

describe("auth HTTP endpoints", () => {
  test("POST /auth/login returns 200 with token for valid credentials", async () => {
    const server = createApiServer(createDependencies());

    const response = await supertest(server).post("/auth/login").send({
      username: "manager",
      passcode: managerPasscode,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe("manager");
    expect(response.body.user.role).toBe("manager");
    expect(typeof response.body.token).toBe("string");
  });

  test("POST /auth/login returns 401 for invalid credentials", async () => {
    const server = createApiServer(createDependencies());

    const response = await supertest(server).post("/auth/login").send({
      username: "manager",
      passcode: "bad-passcode",
    });

    expect(response.status).toBe(401);
  });

  test("POST /auth/login returns 400 for malformed JSON", async () => {
    const server = createApiServer(createDependencies());

    const response = await supertest(server)
      .post("/auth/login")
      .set("content-type", "application/json")
      .send("{bad-json");

    expect(response.status).toBe(400);
  });

  test("GET /auth/me returns 401 when authorization header is missing", async () => {
    const server = createApiServer(createDependencies());

    const response = await supertest(server).get("/auth/me");

    expect(response.status).toBe(401);
  });

  test("GET /auth/me returns 401 when token is expired", async () => {
    let currentNow = new Date("2026-03-04T10:00:00.000Z");
    const server = createApiServer(
      createDependencies({
        authConfig: {
          ...authConfig,
          tokenTtlSeconds: 1,
        },
        now: () => currentNow,
      }),
    );

    const login = await supertest(server).post("/auth/login").send({
      username: "manager",
      passcode: managerPasscode,
    });
    const token = login.body.token as string;

    currentNow = new Date("2026-03-04T10:00:02.000Z");

    const response = await supertest(server)
      .get("/auth/me")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  test("GET /auth/me returns 200 for valid token", async () => {
    const server = createApiServer(createDependencies());

    const login = await supertest(server).post("/auth/login").send({
      username: "manager",
      passcode: managerPasscode,
    });
    const token = login.body.token as string;

    const response = await supertest(server)
      .get("/auth/me")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe("manager");
  });

  test("GET /auth/me returns 403 when role is forbidden for required action", async () => {
    const server = createApiServer(
      createDependencies({
        meRequiredAction: "points.adjustment.apply",
      }),
    );

    const login = await supertest(server).post("/auth/login").send({
      username: "collector",
      passcode: collectorPasscode,
    });
    const token = login.body.token as string;

    const response = await supertest(server)
      .get("/auth/me")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
