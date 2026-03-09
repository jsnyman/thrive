import type { Event } from "../../../../packages/shared/src/domain/events";
import { createCoreRepository } from "./core-repository";
import { createEventStore } from "./event-store";

jest.mock("./event-store", () => ({
  createEventStore: jest.fn(),
}));

type QueryResult = unknown[];

const buildEvent = (eventId: string): Event => ({
  eventId,
  eventType: "person.created",
  occurredAt: "2026-03-07T08:00:00.000Z",
  actorUserId: "2772c203-5df5-4967-9341-09e391f4cb90",
  deviceId: "device-a",
  schemaVersion: 1,
  payload: {
    personId: "person-1",
    name: "Audit",
    surname: "User",
  },
});

describe("core repository audit report", () => {
  test("reports issue classes and supports pagination", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async (sql: string): Promise<QueryResult> => {
        if (sql.includes("missing_event_id")) {
          if (sql.includes("conflict.detected")) {
            return [
              {
                conflict_id: "conflict-1",
                detected_event_id: "event-detected",
                detected_at: new Date("2026-03-07T10:00:00.000Z"),
                missing_event_id: "event-missing",
              },
            ];
          }
          if (sql.includes("resolvedEventId")) {
            return [
              {
                conflict_id: "conflict-2",
                resolution_event_id: "event-resolve-1",
                detected_at: new Date("2026-03-07T09:00:00.000Z"),
                missing_event_id: "event-missing-2",
              },
            ];
          }
          if (sql.includes("relatedEventIds")) {
            return [
              {
                conflict_id: "conflict-2",
                resolution_event_id: "event-resolve-1",
                detected_at: new Date("2026-03-07T09:00:00.000Z"),
                missing_event_id: "event-missing-3",
              },
            ];
          }
        }
        if (
          sql.includes("where e.event_type = 'conflict.resolved'") &&
          sql.includes("not exists")
        ) {
          return [
            {
              conflict_id: "conflict-orphan",
              resolution_event_id: "event-resolve-orphan",
              detected_at: new Date("2026-03-07T08:30:00.000Z"),
            },
          ];
        }
        if (sql.includes("having count(*) > 1") && sql.includes("conflict.detected")) {
          return [
            {
              conflict_id: "conflict-dup",
              latest_detected_at: new Date("2026-03-07T08:00:00.000Z"),
              detected_event_ids: ["event-d1", "event-d2"],
            },
          ];
        }
        if (sql.includes("having count(*) > 1") && sql.includes("conflict.resolved")) {
          return [
            {
              conflict_id: "conflict-dup",
              latest_resolved_at: new Date("2026-03-07T07:00:00.000Z"),
              resolution_event_ids: ["event-r1", "event-r2"],
            },
          ];
        }
        if (sql.includes("from projection_freshness")) {
          return [
            {
              key: "default",
              cursor_recorded_at: new Date("2026-03-07T11:00:00.000Z"),
              cursor_event_id: "00000000-0000-0000-0000-000000000009",
            },
          ];
        }
        if (sql.includes("order by recorded_at desc, event_id desc") && sql.includes("limit 1")) {
          return [
            {
              recorded_at: new Date("2026-03-07T10:30:00.000Z"),
              event_id: "00000000-0000-0000-0000-000000000008",
            },
          ];
        }
        if (sql.includes("where event_id = $1::uuid and recorded_at = $2::timestamptz")) {
          return [];
        }
        return [];
      },
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };

    const repository = createCoreRepository(prisma as never);

    const first = await repository.listSyncAuditReport(2, null);
    expect(first.totalIssues).toBeGreaterThan(2);
    expect(first.issues.length).toBe(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await repository.listSyncAuditReport(2, first.nextCursor);
    expect(second.issues.length).toBeGreaterThan(0);
  });

  test("returns linked metadata for an audit event lookup", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });
    const event = buildEvent("00000000-0000-0000-0000-000000000010");

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async (sql: string): Promise<QueryResult> => {
        if (sql.includes("where event_id = $1::uuid")) {
          return [
            {
              event_id: event.eventId,
              event_type: event.eventType,
              occurred_at: new Date(event.occurredAt),
              recorded_at: new Date("2026-03-07T08:00:01.000Z"),
              actor_user_id: event.actorUserId,
              device_id: event.deviceId,
              location_text: null,
              schema_version: event.schemaVersion,
              correlation_id: null,
              causation_id: null,
              payload: event.payload,
            },
          ];
        }
        if (sql.includes("as conflict_id")) {
          return [{ conflict_id: "conflict-1" }];
        }
        if (sql.includes("as event_id")) {
          return [{ event_id: "event-resolve-1" }];
        }
        return [];
      },
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };

    const repository = createCoreRepository(prisma as never);
    const found = await repository.getSyncAuditEvent(event.eventId);

    expect(found?.event.eventId).toBe(event.eventId);
    expect(found?.linkedConflictIds).toEqual(["conflict-1"]);
    expect(found?.linkedResolutionEventIds).toEqual(["event-resolve-1"]);
  });
});
