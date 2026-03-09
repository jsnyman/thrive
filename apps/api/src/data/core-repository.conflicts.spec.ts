import { createCoreRepository } from "./core-repository";
import { createEventStore } from "./event-store";

jest.mock("./event-store", () => ({
  createEventStore: jest.fn(),
}));

jest.mock("./project-event", () => ({
  projectEventToReadModels: jest.fn(async () => undefined),
}));

jest.mock("../projections/refresh", () => ({
  refreshProjections: jest.fn(async () => undefined),
}));

type QueryRow = Record<string, unknown>;

describe("core repository conflict queries", () => {
  test("listSyncConflicts returns deterministic rows with next cursor", async () => {
    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () =>
        [
          {
            conflict_id: "conflict-1",
            detected_event_id: "event-2",
            detected_at: new Date("2026-03-07T10:00:00.000Z"),
            entity_type: "sale",
            entity_id: "person-1",
            detected_event_ids: ["event-a", "event-b"],
            summary: "STALE_CURSOR_CONFLICT",
            resolution_event_id: null,
            resolved_at: null,
            resolution_value: null,
            resolution_notes: null,
            resolved_by_user_id: null,
          },
        ] satisfies QueryRow[],
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const repository = createCoreRepository(prisma as never);

    const result = await repository.listSyncConflicts("open", 1, null);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.conflictId).toBe("conflict-1");
    expect(result.nextCursor).not.toBeNull();
  });

  test("resolveSyncConflict returns already resolved when resolution exists", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const tx = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql.includes("event_type = 'conflict.detected'")) {
          return [{ detected_event_id: "event-detected" }];
        }
        return [{ detected_event_id: "event-resolved" }];
      },
      $executeRawUnsafe: async () => 0,
      person: {},
      materialType: {},
      item: {},
    };

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () => [],
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (inner: typeof tx) => Promise<T>): Promise<T> => fn(tx),
    };

    const repository = createCoreRepository(prisma as never);
    const result = await repository.resolveSyncConflict(
      "conflict-1",
      {
        resolution: "accepted",
        notes: "done",
      },
      {
        id: "2772c203-5df5-4967-9341-09e391f4cb90",
        username: "manager",
        role: "manager",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "ALREADY_RESOLVED",
    });
  });
});
