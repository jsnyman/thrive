import supertest = require("supertest");
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

const createDependencies = (): ApiServerDependencies => {
  const people: PersonRecord[] = [];
  const materials: MaterialRecord[] = [];
  const items: ItemRecord[] = [];
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

  return {
    authConfig,
    getStaffUserByUsername: getUserByUsername,
    listPeople: async (search) =>
      people.filter((person) => {
        if (search === undefined || search.trim().length === 0) {
          return true;
        }
        const query = search.toLowerCase();
        return person.name.toLowerCase().includes(query) || person.surname.toLowerCase().includes(query);
      }),
    createPerson: async (input) => {
      const record: PersonRecord = {
        id: `person-${people.length + 1}`,
        ...input,
      };
      people.push(record);
      return record;
    },
    listMaterials: async () => materials,
    createMaterial: async (input) => {
      const record: MaterialRecord = {
        id: `material-${materials.length + 1}`,
        ...input,
      };
      materials.push(record);
      return record;
    },
    listItems: async () => items,
    createItem: async (input) => {
      const record: ItemRecord = {
        id: `item-${items.length + 1}`,
        ...input,
      };
      items.push(record);
      return record;
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
    refreshProjections: async () => undefined,
  };
};

const loginAndGetToken = async (server: ReturnType<typeof createApiServer>, username: string, passcode: string) => {
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

  test("GET /people returns created entries for authorized user", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "collector", collectorPasscode);

    await supertest(server).post("/people").set("authorization", `Bearer ${token}`).send({
      name: "A",
      surname: "One",
    });
    await supertest(server).post("/people").set("authorization", `Bearer ${token}`).send({
      name: "B",
      surname: "Two",
    });

    const response = await supertest(server).get("/people").set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.people.length).toBe(2);
  });

  test("GET /ledger/:personId/balance returns projected balance", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "manager", managerPasscode);

    const response = await supertest(server)
      .get("/ledger/person-a/balance")
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.balance.personId).toBe("person-a");
    expect(response.body.balance.balancePoints).toBe(30);
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
});
