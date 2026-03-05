import supertest = require("supertest");
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createPasscodeHash, type AuthConfig, type StaffUserRecord } from "../auth";
import { createApiServer, type ApiServerDependencies } from "./server";

type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

type LedgerEntryRecord = {
  id: string;
  personId: string;
  deltaPoints: number;
  occurredAt: string;
  sourceEventType: string;
  sourceEventId: string;
};

const managerPasscode = "1234";
const collectorPasscode = "9999";
const operatorPasscode = "3333";

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
  {
    id: "4ef81db9-02b7-4a8a-be78-e8896a172df7",
    username: "operator",
    passcodeHash: createPasscodeHash(operatorPasscode),
    role: "shop_operator",
  },
];

const authConfig: AuthConfig = {
  secret: "core-http-test-secret",
  tokenTtlSeconds: 3600,
};

const getUserByUsername = async (username: string): Promise<StaffUserRecord | null> =>
  users.find((user) => user.username === username) ?? null;

const baseNow = new Date("2026-03-05T12:00:00.000Z");

const createDependencies = (): ApiServerDependencies => {
  const people: PersonRecord[] = [
    {
      id: "person-a",
      name: "Alice",
      surname: "Zulu",
    },
  ];
  const materials: MaterialRecord[] = [
    {
      id: "mat-1",
      name: "PET",
      pointsPerKg: 3,
    },
  ];
  const items: ItemRecord[] = [
    {
      id: "item-1",
      name: "Soap",
      pointsPrice: 10,
    },
  ];
  const events: Event[] = [];
  const ledger: LedgerEntryRecord[] = [
    {
      id: "event-1",
      personId: "person-a",
      deltaPoints: 50,
      occurredAt: "2026-03-04T10:00:00.000Z",
      sourceEventType: "intake.recorded",
      sourceEventId: "event-1",
    },
    {
      id: "event-2",
      personId: "person-a",
      deltaPoints: -20,
      occurredAt: "2026-03-04T11:00:00.000Z",
      sourceEventType: "sale.recorded",
      sourceEventId: "event-2",
    },
  ];

  const appendEventAndProject = async (event: Event) => {
    events.push(event);
    if (event.eventType === "person.created") {
      people.push({
        id: event.payload.personId,
        name: event.payload.name,
        surname: event.payload.surname,
        idNumber: event.payload.idNumber ?? null,
        phone: event.payload.phone ?? null,
        address: event.payload.address ?? null,
        notes: event.payload.notes ?? null,
      });
    }
    if (event.eventType === "material_type.created") {
      materials.push({
        id: event.payload.materialTypeId,
        name: event.payload.name,
        pointsPerKg: event.payload.pointsPerKg,
      });
    }
    if (event.eventType === "item.created") {
      items.push({
        id: event.payload.itemId,
        name: event.payload.name,
        pointsPrice: event.payload.pointsPrice,
        costPrice: event.payload.costPrice ?? null,
        sku: event.payload.sku ?? null,
      });
    }
    if (event.eventType === "intake.recorded") {
      ledger.push({
        id: event.eventId,
        personId: event.payload.personId,
        deltaPoints: event.payload.totalPoints,
        occurredAt: event.occurredAt,
        sourceEventType: "intake.recorded",
        sourceEventId: event.eventId,
      });
    }
    if (event.eventType === "sale.recorded") {
      ledger.push({
        id: event.eventId,
        personId: event.payload.personId,
        deltaPoints: event.payload.totalPoints * -1,
        occurredAt: event.occurredAt,
        sourceEventType: "sale.recorded",
        sourceEventId: event.eventId,
      });
    }
    return { status: "accepted" as const };
  };

  return {
    authConfig,
    getStaffUserByUsername: getUserByUsername,
    listPeople: async (search) =>
      people.filter((person) => {
        if (search === undefined || search.trim().length === 0) {
          return true;
        }
        const query = search.toLowerCase();
        return (
          person.name.toLowerCase().includes(query) || person.surname.toLowerCase().includes(query)
        );
      }),
    listMaterials: async () => materials,
    listItems: async () => items,
    getPersonById: async (personId) => people.find((person) => person.id === personId) ?? null,
    getMaterialById: async (materialId) =>
      materials.find((material) => material.id === materialId) ?? null,
    getItemById: async (itemId) => items.find((item) => item.id === itemId) ?? null,
    appendEventAndProject,
    appendEvents: async (incomingEvents) => {
      const results: Array<{ status: "accepted" | "duplicate" | "rejected"; reason?: string }> = [];
      for (const event of incomingEvents) {
        const duplicate = events.some((existing) => existing.eventId === event.eventId);
        if (duplicate) {
          results.push({ status: "duplicate" });
        } else {
          await appendEventAndProject(event);
          results.push({ status: "accepted" });
        }
      }
      return results;
    },
    getLedgerBalance: async (personId) => {
      const total = ledger
        .filter((entry) => entry.personId === personId)
        .reduce((sum, entry) => sum + entry.deltaPoints, 0);
      return {
        personId,
        balancePoints: total,
      };
    },
    listLedgerEntries: async (personId) => ledger.filter((entry) => entry.personId === personId),
    getLivePointsBalance: async (personId) =>
      ledger
        .filter((entry) => entry.personId === personId)
        .reduce((sum, entry) => sum + entry.deltaPoints, 0),
    pullEvents: async (cursor, limit) => {
      const startIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      const normalizedStart = Number.isFinite(startIndex) ? startIndex : 0;
      const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
      const slice = events.slice(normalizedStart, normalizedStart + normalizedLimit);
      const nextCursor = `${normalizedStart + slice.length}`;
      return {
        events: slice,
        nextCursor,
      };
    },
    getSyncStatus: async () => ({
      latestCursor: `${events.length}`,
      projectionRefreshedAt: baseNow.toISOString(),
      projectionCursor: `${events.length}`,
    }),
    now: () => baseNow,
  };
};

const loginAndGetToken = async (
  server: ReturnType<typeof createApiServer>,
  username: string,
  passcode: string,
) => {
  const login = await supertest(server).post("/auth/login").send({
    username,
    passcode,
  });
  return login.body.token as string;
};

describe("core HTTP endpoints", () => {
  test("GET /people returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server).get("/people");
    expect(response.status).toBe(401);
  });

  test("POST /people allows collector", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "collector", collectorPasscode);
    const response = await supertest(server)
      .post("/people")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Jane", surname: "Doe" });

    expect(response.status).toBe(201);
    expect(response.body.person.name).toBe("Jane");
  });

  test("POST /materials rejects collector and allows manager", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "collector", collectorPasscode);
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const denied = await supertest(server)
      .post("/materials")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({ name: "PET", pointsPerKg: 2 });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/materials")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "PET", pointsPerKg: 2 });
    expect(allowed.status).toBe(201);
    expect(allowed.body.material.name).toBe("PET");
  });

  test("POST /items rejects shop operator and allows manager", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "operator", operatorPasscode);
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const denied = await supertest(server)
      .post("/items")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({ name: "Soap", pointsPrice: 15 });
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .post("/items")
      .set("authorization", `Bearer ${managerToken}`)
      .send({ name: "Soap", pointsPrice: 15 });
    expect(allowed.status).toBe(201);
    expect(allowed.body.item.name).toBe("Soap");
  });

  test("POST /intakes calculates floored points and credits ledger", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "collector", collectorPasscode);

    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 2.9 }],
      });

    expect(intake.status).toBe(201);
    expect(intake.body.totalPoints).toBe(8);

    const balance = await supertest(server)
      .get("/ledger/person-a/balance")
      .set("authorization", `Bearer ${token}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance.balancePoints).toBe(38);
  });

  test("POST /sales blocks insufficient points", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 9 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_POINTS");
  });

  test("GET /ledger/:personId/entries returns projected entries", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .get("/ledger/person-a/entries")
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.entries.length).toBe(2);
  });

  test("sync push and pull work with cursor", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "manager", managerPasscode);
    const eventId = "88a02142-9ba0-49cc-9f01-b4b4726d1e44";

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        events: [
          {
            eventId,
            eventType: "person.created",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-b",
            schemaVersion: 1,
            payload: {
              personId: "person-sync",
              name: "Sync",
              surname: "Person",
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(push.body.acknowledgements[0].status).toBe("accepted");

    const pull = await supertest(server)
      .get("/sync/pull?cursor=0&limit=10")
      .set("authorization", `Bearer ${token}`);
    expect(pull.status).toBe(200);
    expect(Array.isArray(pull.body.events)).toBe(true);
  });
});
