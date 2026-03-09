import type { Event } from "../../../../packages/shared/src/domain/events";
import { createCoreRepository } from "./core-repository";
import { createEventStore } from "./event-store";
import { refreshProjections } from "../projections/refresh";

jest.mock("./event-store", () => ({
  createEventStore: jest.fn(),
}));

jest.mock("../projections/refresh", () => ({
  refreshProjections: jest.fn(async () => undefined),
}));

jest.mock("./project-event", () => ({
  projectEventToReadModels: jest.fn(async () => undefined),
}));

type MockedEventStore = {
  appendEvent: jest.Mock<
    Promise<{ status: "accepted" | "duplicate" | "rejected"; reason?: string }>,
    [Event]
  >;
  listEventsForMergeReplay: jest.Mock<Promise<Array<{ event: Event; recordedAt: string }>>, []>;
  pullEvents: jest.Mock;
  getLatestCursor: jest.Mock;
  getProjectionFreshness: jest.Mock;
};

const buildEvent = (
  overrides: Partial<Event> & Pick<Event, "eventType" | "payload" | "eventId">,
): Event =>
  ({
    eventId: overrides.eventId,
    eventType: overrides.eventType,
    occurredAt: overrides.occurredAt ?? "2026-03-07T10:00:00.000Z",
    recordedAt: overrides.recordedAt ?? null,
    actorUserId: overrides.actorUserId ?? "2772c203-5df5-4967-9341-09e391f4cb90",
    deviceId: overrides.deviceId ?? "device-a",
    locationText: overrides.locationText ?? null,
    schemaVersion: overrides.schemaVersion ?? 1,
    correlationId: overrides.correlationId ?? null,
    causationId: overrides.causationId ?? null,
    payload: overrides.payload,
  }) as Event;

describe("createCoreRepository appendEvents merge behavior", () => {
  test("appends conflict.detected when merge policy rejects with conflict", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    const existingPerson = buildEvent({
      eventId: "event-person-created",
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Amy",
        surname: "Zulu",
      },
    });
    const existingUpdate = buildEvent({
      eventId: "event-person-updated",
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          name: "Amelia",
        },
      },
    });

    const appendEventMock: MockedEventStore["appendEvent"] = jest.fn(async (event) => {
      if (event.eventType === "conflict.detected") {
        return { status: "accepted" as const };
      }
      return { status: "accepted" as const };
    });

    const eventStore: MockedEventStore = {
      appendEvent: appendEventMock,
      listEventsForMergeReplay: jest.fn(async () => [
        { event: existingPerson, recordedAt: "2026-03-07T10:00:01.000Z" },
        { event: existingUpdate, recordedAt: "2026-03-07T10:00:05.000Z" },
      ]),
      pullEvents: jest.fn(),
      getLatestCursor: jest.fn(),
      getProjectionFreshness: jest.fn(),
    };
    createEventStoreMock.mockReturnValue(
      eventStore as unknown as ReturnType<typeof createEventStore>,
    );

    const prisma = {
      person: {},
      materialType: {},
      item: {},
      $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async () => [],
      $queryRaw: async () => [],
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({}),
    };

    const repository = createCoreRepository(prisma as never);

    const incoming = buildEvent({
      eventId: "event-client-update",
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          surname: "Khumalo",
        },
      },
    });

    const staleCursor = Buffer.from(
      JSON.stringify({
        recordedAt: "2026-03-07T10:00:03.000Z",
        eventId: "event-cursor",
      }),
      "utf8",
    ).toString("base64url");

    const result = await repository.appendEvents([incoming], staleCursor);

    expect(result).toEqual([
      {
        status: "rejected",
        reason: "STALE_CURSOR_CONFLICT",
      },
    ]);

    const conflictAppendCalls = appendEventMock.mock.calls
      .map((call) => call[0])
      .filter((event) => event.eventType === "conflict.detected");
    expect(conflictAppendCalls).toHaveLength(1);
    expect(conflictAppendCalls[0]?.payload.summary).toBe("STALE_CURSOR_CONFLICT");
    expect(refreshProjections).toHaveBeenCalledTimes(1);
  });
});
