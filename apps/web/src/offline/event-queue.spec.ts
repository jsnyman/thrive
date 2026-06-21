import { describe, expect, test } from "vitest";
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createEventQueue, createMemoryEventQueueStore } from "./event-queue";

const buildEvent = (eventId: string): Event => ({
  eventId,
  eventType: "person.created",
  occurredAt: "2026-03-05T10:00:00.000Z",
  actorUserId: "2772c203-5df5-4967-9341-09e391f4cb90",
  deviceId: "device-web-1",
  schemaVersion: 1,
  payload: {
    personId: `person-${eventId}`,
    name: "Test",
    surname: "User",
  },
});

describe("event queue", () => {
  test("enqueues and dequeues in insertion order", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());
    await queue.enqueue(buildEvent("event-1"));
    await queue.enqueue(buildEvent("event-2"));

    const batch = await queue.dequeueBatch(2);
    expect(batch.map((event) => event.eventId)).toEqual(["event-1", "event-2"]);
  });

  test("ack removes only acknowledged events", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());
    await queue.enqueue(buildEvent("event-1"));
    await queue.enqueue(buildEvent("event-2"));
    await queue.enqueue(buildEvent("event-3"));

    await queue.ack(["event-2"]);

    const batch = await queue.dequeueBatch(10);
    expect(batch.map((event) => event.eventId)).toEqual(["event-1", "event-3"]);
  });

  test("concurrent enqueues do not lose events", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());

    await Promise.all([
      queue.enqueue(buildEvent("event-1")),
      queue.enqueue(buildEvent("event-2")),
      queue.enqueue(buildEvent("event-3")),
    ]);

    const batch = await queue.dequeueBatch(10);
    expect(batch.map((event) => event.eventId)).toEqual(["event-1", "event-2", "event-3"]);
  });

  test("a failing operation does not block subsequent operations", async () => {
    let callCount = 0;
    const faultyStore = createMemoryEventQueueStore();
    const failingStore = {
      ...faultyStore,
      save: async (events: Parameters<typeof faultyStore.save>[0]): Promise<void> => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("transient save failure");
        }
        return faultyStore.save(events);
      },
    };

    const queue = createEventQueue(failingStore);
    await expect(queue.enqueue(buildEvent("event-1"))).rejects.toThrow("transient save failure");
    await queue.enqueue(buildEvent("event-2"));

    const batch = await queue.dequeueBatch(10);
    expect(batch.map((event) => event.eventId)).toEqual(["event-2"]);
  });
});
