import supertest = require("supertest");
import type { Event } from "../../../../packages/shared/src/domain/events";
import type {
  SyncAuditIssue,
  SyncConflictRecord,
  SyncResolveConflictRequest,
} from "../../../../packages/shared/src/domain/sync";
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

type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";

type InventoryBatchRecord = {
  inventoryBatchId: string;
  itemId: string;
  quantities: Record<InventoryStatus, number>;
};

type InventoryStatusSummaryRecord = {
  status: InventoryStatus;
  totalQuantity: number;
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

const createDependencies = (options?: {
  inventoryBatches?: InventoryBatchRecord[];
}): ApiServerDependencies => {
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
  const inventoryBatches: InventoryBatchRecord[] = options?.inventoryBatches?.map((batch) => ({
    inventoryBatchId: batch.inventoryBatchId,
    itemId: batch.itemId,
    quantities: {
      storage: batch.quantities.storage,
      shop: batch.quantities.shop,
      sold: batch.quantities.sold,
      spoiled: batch.quantities.spoiled,
      damaged: batch.quantities.damaged,
      missing: batch.quantities.missing,
    },
  })) ?? [
    {
      inventoryBatchId: "batch-1",
      itemId: "item-1",
      quantities: {
        storage: 10,
        shop: 0,
        sold: 0,
        spoiled: 0,
        damaged: 0,
        missing: 0,
      },
    },
  ];
  const events: Event[] = [];
  const auditIssues: SyncAuditIssue[] = [
    {
      issueId: "issue-1",
      code: "DUPLICATE_CONFLICT_ID",
      detectedAt: "2026-03-05T11:30:00.000Z",
      severity: "warning",
      detail: "duplicate conflict",
      relatedEventIds: ["event-a", "event-b"],
      conflictId: "conflict-open",
    },
  ];
  const conflicts: SyncConflictRecord[] = [
    {
      conflictId: "conflict-open",
      detectedEventId: "event-detected-open",
      detectedAt: "2026-03-05T11:00:00.000Z",
      entityType: "sale",
      entityId: "person-a",
      detectedEventIds: ["event-a", "event-b"],
      summary: "STALE_CURSOR_CONFLICT",
      resolved: false,
      resolvedAt: null,
      resolution: null,
      resolutionEventId: null,
      resolutionNotes: null,
      resolvedByUserId: null,
    },
    {
      conflictId: "conflict-resolved",
      detectedEventId: "event-detected-resolved",
      detectedAt: "2026-03-05T10:00:00.000Z",
      entityType: "person",
      entityId: "person-b",
      detectedEventIds: ["event-c", "event-d"],
      summary: "ENTITY_ALREADY_EXISTS",
      resolved: true,
      resolvedAt: "2026-03-05T10:05:00.000Z",
      resolution: "accepted",
      resolutionEventId: "event-resolve-1",
      resolutionNotes: "resolved",
      resolvedByUserId: users[0]?.id ?? null,
    },
  ];
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
    if (event.eventType === "person.profile_updated") {
      const existingPerson = people.find((person) => person.id === event.payload.personId);
      if (existingPerson !== undefined) {
        if (event.payload.updates.name !== undefined) {
          existingPerson.name = event.payload.updates.name;
        }
        if (event.payload.updates.surname !== undefined) {
          existingPerson.surname = event.payload.updates.surname;
        }
        if (event.payload.updates.idNumber !== undefined) {
          existingPerson.idNumber = event.payload.updates.idNumber;
        }
        if (event.payload.updates.phone !== undefined) {
          existingPerson.phone = event.payload.updates.phone;
        }
        if (event.payload.updates.address !== undefined) {
          existingPerson.address = event.payload.updates.address;
        }
        if (event.payload.updates.notes !== undefined) {
          existingPerson.notes = event.payload.updates.notes;
        }
      }
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
      for (const line of event.payload.lines) {
        if (line.inventoryBatchId === null || line.inventoryBatchId === undefined) {
          continue;
        }
        const batch = inventoryBatches.find(
          (entry) => entry.inventoryBatchId === line.inventoryBatchId,
        );
        if (batch !== undefined) {
          batch.quantities.shop -= line.quantity;
          batch.quantities.sold += line.quantity;
        }
      }
    }
    if (event.eventType === "inventory.status_changed") {
      const batch = inventoryBatches.find(
        (entry) => entry.inventoryBatchId === event.payload.inventoryBatchId,
      );
      if (batch !== undefined) {
        batch.quantities[event.payload.fromStatus] -= event.payload.quantity;
        batch.quantities[event.payload.toStatus] += event.payload.quantity;
      }
    }
    if (event.eventType === "procurement.recorded") {
      for (const line of event.payload.lines) {
        inventoryBatches.push({
          inventoryBatchId: line.inventoryBatchId,
          itemId: line.itemId,
          quantities: {
            storage: line.quantity,
            shop: 0,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        });
      }
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
    listShopBatchesForItem: async (itemId) =>
      inventoryBatches.filter((batch) => batch.itemId === itemId && batch.quantities.shop > 0),
    getPersonById: async (personId) => people.find((person) => person.id === personId) ?? null,
    getMaterialById: async (materialId) =>
      materials.find((material) => material.id === materialId) ?? null,
    getItemById: async (itemId) => items.find((item) => item.id === itemId) ?? null,
    listInventoryBatches: async () => inventoryBatches,
    listInventoryStatusSummary: async () => {
      const statuses: InventoryStatus[] = [
        "storage",
        "shop",
        "sold",
        "spoiled",
        "damaged",
        "missing",
      ];
      return statuses.map((status) => ({
        status,
        totalQuantity: inventoryBatches.reduce((sum, batch) => sum + batch.quantities[status], 0),
      }));
    },
    getInventoryBatchState: async (inventoryBatchId) => {
      const batch = inventoryBatches.find((entry) => entry.inventoryBatchId === inventoryBatchId);
      if (batch === undefined) {
        return null;
      }
      return {
        inventoryBatchId: batch.inventoryBatchId,
        itemId: batch.itemId,
        quantities: {
          storage: batch.quantities.storage,
          shop: batch.quantities.shop,
          sold: batch.quantities.sold,
          spoiled: batch.quantities.spoiled,
          damaged: batch.quantities.damaged,
          missing: batch.quantities.missing,
        },
      };
    },
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
    listSyncConflicts: async (status, limit, cursor) => {
      const filtered = conflicts
        .filter((conflict) => (status === "open" ? !conflict.resolved : true))
        .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
      const startIndex =
        cursor === null
          ? 0
          : filtered.findIndex((conflict) => conflict.detectedEventId === cursor) + 1;
      const normalizedStart = startIndex < 0 ? 0 : startIndex;
      const page = filtered.slice(normalizedStart, normalizedStart + limit);
      const nextCursor =
        normalizedStart + limit >= filtered.length
          ? null
          : (page[page.length - 1]?.detectedEventId ?? null);
      return {
        conflicts: page,
        nextCursor,
      };
    },
    resolveSyncConflict: async (conflictId, request, actor) => {
      const target = conflicts.find((conflict) => conflict.conflictId === conflictId);
      if (target === undefined) {
        return { ok: false as const, error: "CONFLICT_NOT_FOUND" as const };
      }
      if (target.resolved) {
        return { ok: false as const, error: "ALREADY_RESOLVED" as const };
      }
      const typedRequest: SyncResolveConflictRequest = request;
      target.resolved = true;
      target.resolvedAt = baseNow.toISOString();
      target.resolution = typedRequest.resolution;
      target.resolutionEventId = "event-resolve-new";
      target.resolutionNotes = typedRequest.notes;
      target.resolvedByUserId = actor.id;
      return {
        ok: true as const,
        value: {
          conflictId,
          resolutionEventId: "event-resolve-new",
        },
      };
    },
    listSyncAuditReport: async (limit, cursor) => {
      const startIndex = cursor === null ? 0 : Number.parseInt(cursor, 10);
      const normalized = Number.isFinite(startIndex) ? startIndex : 0;
      const page = auditIssues.slice(normalized, normalized + limit);
      const nextCursor =
        normalized + limit >= auditIssues.length ? null : String(normalized + page.length);
      return {
        generatedAt: baseNow.toISOString(),
        totalIssues: auditIssues.length,
        errorCount: auditIssues.filter((issue) => issue.severity === "error").length,
        warningCount: auditIssues.filter((issue) => issue.severity === "warning").length,
        issues: page,
        nextCursor,
      };
    },
    getSyncAuditEvent: async (eventId) => {
      const found = events.find((event) => event.eventId === eventId);
      if (found === undefined) {
        return null;
      }
      return {
        event: found,
        linkedConflictIds: ["conflict-open"],
        linkedResolutionEventIds: [],
      };
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

  test("PATCH /people/:personId returns 401 without authorization", async () => {
    const server = createApiServer(createDependencies());
    const response = await supertest(server)
      .patch("/people/person-a")
      .send({
        updates: {
          notes: "new note",
        },
      });
    expect(response.status).toBe(401);
  });

  test("PATCH /people/:personId allows collector and manager", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "collector", collectorPasscode);
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const collectorResponse = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({
        updates: {
          notes: "new note",
        },
      });
    expect(collectorResponse.status).toBe(200);
    expect(collectorResponse.body.person.id).toBe("person-a");
    expect(collectorResponse.body.person.notes).toBe("new note");

    const allowed = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          phone: "0123456789",
        },
      });
    expect(allowed.status).toBe(200);
    expect(allowed.body.person.id).toBe("person-a");
    expect(allowed.body.person.phone).toBe("0123456789");
  });

  test("PATCH /people/:personId returns 404 for unknown person", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);
    const response = await supertest(server)
      .patch("/people/person-missing")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          phone: "012345",
        },
      });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("PERSON_NOT_FOUND");
  });

  test("PATCH /people/:personId returns 400 for invalid payload", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const emptyUpdate = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {},
      });
    expect(emptyUpdate.status).toBe(400);

    const unknownField = await supertest(server)
      .patch("/people/person-a")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        updates: {
          email: "x@y.z",
        },
      });
    expect(unknownField.status).toBe(400);
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
    const stockMove = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${token}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 10,
        reason: "stock for sales",
      });
    expect(stockMove.status).toBe(201);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 9 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_POINTS");
    expect(response.body.balancePoints).toBe(30);
    expect(response.body.requestedPoints).toBe(90);

    const balance = await supertest(server)
      .get("/ledger/person-a/balance")
      .set("authorization", `Bearer ${token}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance.balancePoints).toBe(30);
  });

  test("POST /sales allocates FIFO batches when inventoryBatchId is omitted", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 4,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
        {
          inventoryBatchId: "batch-2",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 5,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "manager", managerPasscode);
    const intake = await supertest(server)
      .post("/intakes")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ materialTypeId: "mat-1", weightKg: 30 }],
      });
    expect(intake.status).toBe(201);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 7 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.totalPoints).toBe(70);

    const summary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${token}`);
    expect(summary.status).toBe(200);
    const rows = summary.body.summary as InventoryStatusSummaryRecord[];
    const shop = rows.find((entry) => entry.status === "shop");
    const sold = rows.find((entry) => entry.status === "sold");
    expect(shop?.totalQuantity).toBe(2);
    expect(sold?.totalQuantity).toBe(7);
  });

  test("POST /sales rejects when explicit batch does not belong to line item", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-2",
          quantities: {
            storage: 0,
            shop: 4,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", inventoryBatchId: "batch-1", quantity: 1 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INVENTORY_BATCH_ITEM_MISMATCH");
  });

  test("POST /sales rejects insufficient stock with deterministic details", async () => {
    const dependencies = createDependencies({
      inventoryBatches: [
        {
          inventoryBatchId: "batch-1",
          itemId: "item-1",
          quantities: {
            storage: 0,
            shop: 2,
            sold: 0,
            spoiled: 0,
            damaged: 0,
            missing: 0,
          },
        },
      ],
    });
    const server = createApiServer(dependencies);
    const token = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .post("/sales")
      .set("authorization", `Bearer ${token}`)
      .send({
        personId: "person-a",
        lines: [{ itemId: "item-1", quantity: 3 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_STOCK");
    expect(response.body.itemId).toBe("item-1");
    expect(response.body.requiredQuantity).toBe(3);
    expect(response.body.availableQuantity).toBe(2);
  });

  test("POST /procurements enforces manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3 }],
      });

    expect(response.status).toBe(403);
  });

  test("POST /procurements validates payload and unknown items", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const badPayload = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        lines: [{ itemId: "item-1", quantity: 0, unitCost: 3 }],
      });
    expect(badPayload.status).toBe(400);

    const missingItem = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        lines: [{ itemId: "item-missing", quantity: 2, unitCost: 3 }],
      });
    expect(missingItem.status).toBe(404);
    expect(missingItem.body.error).toBe("ITEM_NOT_FOUND");
  });

  test("POST /procurements appends event and increases storage inventory", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const beforeSummary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${managerToken}`);
    expect(beforeSummary.status).toBe(200);

    const response = await supertest(server)
      .post("/procurements")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        supplierName: "Village Supplier",
        tripDistanceKm: 12,
        lines: [{ itemId: "item-1", quantity: 2, unitCost: 3 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.eventId).toBeDefined();
    expect(response.body.cashTotal).toBe(6);
    expect(response.body.lines).toHaveLength(1);
    expect(response.body.lines[0]?.lineTotalCost).toBe(6);
    expect(typeof response.body.lines[0]?.inventoryBatchId).toBe("string");

    const afterSummary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${managerToken}`);
    expect(afterSummary.status).toBe(200);
    const rows = afterSummary.body.summary as InventoryStatusSummaryRecord[];
    const storage = rows.find((entry) => entry.status === "storage");
    expect(storage?.totalQuantity).toBe(12);
  });

  test("POST /expenses requires authorization and manager role", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "operator", operatorPasscode);

    const unauthorized = await supertest(server).post("/expenses").send({
      category: "Fuel",
      cashAmount: 10,
    });
    expect(unauthorized.status).toBe(401);

    const forbidden = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        category: "Fuel",
        cashAmount: 10,
      });
    expect(forbidden.status).toBe(403);
  });

  test("POST /expenses validates payload", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const missingCategory = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        cashAmount: 10,
      });
    expect(missingCategory.status).toBe(400);
    expect(missingCategory.body.error).toBe("BAD_REQUEST");

    const invalidAmount = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: "10",
      });
    expect(invalidAmount.status).toBe(400);
    expect(invalidAmount.body.error).toBe("BAD_REQUEST");

    const negativeAmount = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: -1,
      });
    expect(negativeAmount.status).toBe(400);
    expect(negativeAmount.body.error).toBe("BAD_REQUEST");
  });

  test("POST /expenses appends expense.recorded event", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const response = await supertest(server)
      .post("/expenses")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        category: "Fuel",
        cashAmount: 99.5,
        notes: "Round trip collection",
        receiptRef: "RCPT-1",
      });

    expect(response.status).toBe(201);
    expect(response.body.eventId).toBeDefined();
    expect(response.body.expense.category).toBe("Fuel");
    expect(response.body.expense.cashAmount).toBe(99.5);
    expect(response.body.expense.notes).toBe("Round trip collection");
    expect(response.body.expense.receiptRef).toBe("RCPT-1");
  });

  test("GET /inventory/status-summary returns totals for authorized user", async () => {
    const server = createApiServer(createDependencies());
    const token = await loginAndGetToken(server, "operator", operatorPasscode);

    const response = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const summary = response.body.summary as InventoryStatusSummaryRecord[];
    const storage = summary.find(
      (entry: InventoryStatusSummaryRecord) => entry.status === "storage",
    );
    expect(storage?.totalQuantity).toBe(10);
  });

  test("POST /inventory/status-changes enforces underflow and applies valid moves", async () => {
    const server = createApiServer(createDependencies());
    const operatorToken = await loginAndGetToken(server, "operator", operatorPasscode);

    const underflow = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 99,
        reason: "move to shop",
      });
    expect(underflow.status).toBe(409);
    expect(underflow.body.error).toBe("INVENTORY_UNDERFLOW");
    expect(underflow.body.availableQuantity).toBe(10);

    const success = await supertest(server)
      .post("/inventory/status-changes")
      .set("authorization", `Bearer ${operatorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 4,
        reason: "move to shop",
      });
    expect(success.status).toBe(201);

    const summary = await supertest(server)
      .get("/inventory/status-summary")
      .set("authorization", `Bearer ${operatorToken}`);
    expect(summary.status).toBe(200);
    const summaryRows = summary.body.summary as InventoryStatusSummaryRecord[];
    const storage = summaryRows.find(
      (entry: InventoryStatusSummaryRecord) => entry.status === "storage",
    );
    const shop = summaryRows.find((entry: InventoryStatusSummaryRecord) => entry.status === "shop");
    expect(storage?.totalQuantity).toBe(6);
    expect(shop?.totalQuantity).toBe(4);
  });

  test("POST /inventory/adjustments/requests allows collector and records request event", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "collector", collectorPasscode);

    const response = await supertest(server)
      .post("/inventory/adjustments/requests")
      .set("authorization", `Bearer ${collectorToken}`)
      .send({
        inventoryBatchId: "batch-1",
        requestedStatus: "spoiled",
        quantity: 1,
        reason: "packaging tear",
      });

    expect(response.status).toBe(201);
    expect(response.body.requestEventId).toBeDefined();
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

  test("sync push forwards lastKnownCursor and returns mixed acknowledgements", async () => {
    let capturedCursor: string | null | undefined;
    const dependencies = createDependencies();
    const server = createApiServer({
      ...dependencies,
      appendEvents: async (incomingEvents, lastKnownCursor) => {
        capturedCursor = lastKnownCursor;
        return incomingEvents.map((event, index) => {
          if (index === 0) {
            return { status: "accepted" as const };
          }
          if (index === 1) {
            return { status: "duplicate" as const };
          }
          return { status: "rejected" as const, reason: "STALE_CURSOR_CONFLICT" };
        });
      },
    });
    const token = await loginAndGetToken(server, "manager", managerPasscode);
    const cursor = "eyJyZWNvcmRlZEF0IjoiMjAyNi0wMy0wNVQxMjowMDowMC4wMDBaIiwiZXZlbnRJZCI6ImUxIn0";

    const push = await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        lastKnownCursor: cursor,
        events: [
          {
            eventId: "evt-1",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:00:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 5,
            },
          },
          {
            eventId: "evt-2",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:01:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 6,
            },
          },
          {
            eventId: "evt-3",
            eventType: "expense.recorded",
            occurredAt: "2026-03-05T12:02:00.000Z",
            actorUserId: users[0]?.id,
            deviceId: "device-a",
            schemaVersion: 1,
            payload: {
              category: "Fuel",
              cashAmount: 7,
            },
          },
        ],
      });

    expect(push.status).toBe(200);
    expect(capturedCursor).toBe(cursor);
    expect(push.body.acknowledgements).toEqual([
      { eventId: "evt-1", status: "accepted" },
      { eventId: "evt-2", status: "duplicate" },
      { eventId: "evt-3", status: "rejected", reason: "STALE_CURSOR_CONFLICT" },
    ]);
  });

  test("GET /sync/conflicts requires manager role", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "collector", collectorPasscode);
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const denied = await supertest(server)
      .get("/sync/conflicts?status=open&limit=10")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .get("/sync/conflicts?status=open&limit=10")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.conflicts)).toBe(true);
    expect(allowed.body.conflicts).toHaveLength(1);
    expect(allowed.body.conflicts[0]?.conflictId).toBe("conflict-open");
  });

  test("POST /sync/conflicts/:id/resolve resolves open conflict for manager", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const response = await supertest(server)
      .post("/sync/conflicts/conflict-open/resolve")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        resolution: "merged",
        notes: "manual merge",
      });

    expect(response.status).toBe(200);
    expect(response.body.conflictId).toBe("conflict-open");
    expect(response.body.resolutionEventId).toBe("event-resolve-new");
  });

  test("POST /sync/conflicts/:id/resolve returns 404 for unknown conflict", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const response = await supertest(server)
      .post("/sync/conflicts/conflict-missing/resolve")
      .set("authorization", `Bearer ${managerToken}`)
      .send({
        resolution: "rejected",
        notes: "not found",
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("CONFLICT_NOT_FOUND");
  });

  test("GET /sync/audit/report requires manager role and returns report", async () => {
    const server = createApiServer(createDependencies());
    const collectorToken = await loginAndGetToken(server, "collector", collectorPasscode);
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const unauthorized = await supertest(server).get("/sync/audit/report?limit=10");
    expect(unauthorized.status).toBe(401);

    const denied = await supertest(server)
      .get("/sync/audit/report?limit=10")
      .set("authorization", `Bearer ${collectorToken}`);
    expect(denied.status).toBe(403);

    const allowed = await supertest(server)
      .get("/sync/audit/report?limit=10")
      .set("authorization", `Bearer ${managerToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.totalIssues).toBe(1);
    expect(Array.isArray(allowed.body.issues)).toBe(true);
  });

  test("GET /sync/audit/event/:eventId returns 404 for unknown event", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);

    const missing = await supertest(server)
      .get("/sync/audit/event/missing-event")
      .set("authorization", `Bearer ${managerToken}`);
    expect(missing.status).toBe(404);
  });

  test("GET /sync/audit/event/:eventId returns linked metadata", async () => {
    const server = createApiServer(createDependencies());
    const managerToken = await loginAndGetToken(server, "manager", managerPasscode);
    const eventId = "e2cfd0ff-f35e-442e-8694-f6fc8533a400";

    await supertest(server)
      .post("/sync/push")
      .set("authorization", `Bearer ${managerToken}`)
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
              personId: "person-audit",
              name: "Audit",
              surname: "Event",
            },
          },
        ],
      });

    const response = await supertest(server)
      .get(`/sync/audit/event/${eventId}`)
      .set("authorization", `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.event.eventId).toBe(eventId);
    expect(Array.isArray(response.body.linkedConflictIds)).toBe(true);
  });
});
