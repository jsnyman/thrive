import { createCoreRepository } from "./core-repository";
import { createEventStore } from "./event-store";
import { refreshProjections } from "../projections/refresh";

jest.mock("./event-store", () => ({
  createEventStore: jest.fn(),
}));

jest.mock("./project-event", () => ({
  projectEventToReadModels: jest.fn(async () => undefined),
}));

jest.mock("../projections/refresh", () => ({
  refreshProjections: jest.fn(async () => undefined),
}));

type QueryResult = unknown[];

describe("core repository reconciliation", () => {
  test("lists reconciliation issues with deterministic IDs and repair suggestions", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () =>
        Buffer.from(
          JSON.stringify({
            recordedAt: "2026-03-07T10:00:10.000Z",
            eventId: "00000000-0000-0000-0000-000000000010",
          }),
          "utf8",
        ).toString("base64url"),
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({
        refreshedAt: "2026-03-07T10:00:05.000Z",
        cursor: Buffer.from(
          JSON.stringify({
            recordedAt: "2026-03-07T10:00:05.000Z",
            eventId: "00000000-0000-0000-0000-000000000005",
          }),
          "utf8",
        ).toString("base64url"),
      }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: {
        findMany: async () => [{ id: "person-1" }],
        findUnique: async () => null,
      },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (
        sql: TemplateStringsArray | string,
        ...values: unknown[]
      ): Promise<QueryResult> => {
        const queryText = Array.isArray(sql) ? sql.join(" ") : sql;
        if (queryText.includes("from mv_points_balances")) {
          if (queryText.includes("where person_id =")) {
            return [{ person_id: "person-1", balance_points: 35.7 }];
          }
          return [{ person_id: "person-1", balance_points: 35.7 }];
        }
        if (queryText.includes("from ledger")) {
          const personId = values[0];
          if (personId === "person-1") {
            return [{ balance_points: 38.7 }];
          }
          return [{ balance_points: 0 }];
        }
        if (queryText.includes("from mv_inventory_status_summary")) {
          return [
            { status: "storage", total_quantity: 1 },
            { status: "shop", total_quantity: 0 },
            { status: "sold", total_quantity: 0 },
            { status: "spoiled", total_quantity: 0 },
            { status: "damaged", total_quantity: 0 },
            { status: "missing", total_quantity: 0 },
          ];
        }
        if (queryText.includes("from event") && queryText.includes("procurement.recorded")) {
          return [
            {
              event_type: "procurement.recorded",
              payload: {
                lines: [
                  {
                    inventoryBatchId: "batch-1",
                    itemId: "item-1",
                    quantity: 1,
                    unitCost: 4.25,
                  },
                ],
              },
            },
            {
              event_type: "inventory.status_changed",
              payload: {
                inventoryBatchId: "batch-1",
                fromStatus: "storage",
                toStatus: "shop",
                quantity: 2,
              },
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };

    const repository = createCoreRepository(prisma as never);
    const report = await repository.listSyncReconciliationReport(10, null, null, false);

    expect(report.summary.totalIssues).toBeGreaterThanOrEqual(3);
    expect(report.issues.map((issue) => issue.issueId)).toContain(
      "POINTS_BALANCE_MISMATCH:person-1",
    );
    expect(report.issues.map((issue) => issue.issueId)).toContain(
      "INVENTORY_BATCH_NEGATIVE_QUANTITY:batch-1:storage",
    );
    expect(report.issues.map((issue) => issue.issueId)).toContain(
      "PROJECTION_CURSOR_DRIFT:default",
    );
  });

  test("repairs a points mismatch by appending a points adjustment event", async () => {
    const appendEvent = jest.fn(async () => ({ status: "accepted" as const }));
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent,
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: {
        findMany: async () => [{ id: "person-1" }],
        findUnique: async () => null,
      },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (
        sql: TemplateStringsArray | string,
        ...values: unknown[]
      ): Promise<QueryResult> => {
        const queryText = Array.isArray(sql) ? sql.join(" ") : sql;
        if (queryText.includes("from mv_points_balances")) {
          return [{ person_id: "person-1", balance_points: 35.7 }];
        }
        if (queryText.includes("from ledger")) {
          const personId = values[0];
          if (personId === "person-1") {
            return [{ balance_points: 38.7 }];
          }
          return [{ balance_points: 0 }];
        }
        if (queryText.includes("from mv_inventory_status_summary")) {
          return [];
        }
        if (queryText.includes("from event") && queryText.includes("procurement.recorded")) {
          return [];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };

    const repository = createCoreRepository(prisma as never);
    const result = await repository.repairSyncReconciliationIssue(
      "POINTS_BALANCE_MISMATCH:person-1",
      "checked ledger",
      {
        id: "2772c203-5df5-4967-9341-09e391f4cb90",
        username: "manager",
        role: "manager",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.repairKind).toBe("points_adjustment");
    expect(appendEvent).toHaveBeenCalledTimes(1);
  });

  test("repairs projection drift by rebuilding projections", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () =>
        Buffer.from(
          JSON.stringify({
            recordedAt: "2026-03-07T10:00:10.000Z",
            eventId: "00000000-0000-0000-0000-000000000010",
          }),
          "utf8",
        ).toString("base64url"),
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({
        refreshedAt: "2026-03-07T10:00:05.000Z",
        cursor: Buffer.from(
          JSON.stringify({
            recordedAt: "2026-03-07T10:00:05.000Z",
            eventId: "00000000-0000-0000-0000-000000000005",
          }),
          "utf8",
        ).toString("base64url"),
      }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: {
        findMany: async () => [],
        findUnique: async () => null,
      },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (sql: TemplateStringsArray | string): Promise<QueryResult> => {
        const queryText = Array.isArray(sql) ? sql.join(" ") : sql;
        if (queryText.includes("from mv_points_balances")) {
          return [];
        }
        if (queryText.includes("from mv_inventory_status_summary")) {
          return [];
        }
        if (queryText.includes("from event") && queryText.includes("procurement.recorded")) {
          return [];
        }
        return [{ balance_points: 0 }];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };

    const repository = createCoreRepository(prisma as never);
    const result = await repository.repairSyncReconciliationIssue(
      "PROJECTION_CURSOR_DRIFT:default",
      "rebuild now",
      {
        id: "2772c203-5df5-4967-9341-09e391f4cb90",
        username: "manager",
        role: "manager",
      },
    );

    expect(result.ok).toBe(true);
    expect(refreshProjections).toHaveBeenCalledTimes(1);
  });
});
