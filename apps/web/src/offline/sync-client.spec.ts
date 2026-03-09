import { describe, expect, test, vi } from "vitest";
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createEventQueue, createMemoryEventQueueStore } from "./event-queue";
import { createSyncClient } from "./sync-client";
import { createMemorySyncStateStore } from "./sync-state-store";

const buildEvent = (eventId: string): Event => ({
  eventId,
  eventType: "person.created",
  occurredAt: "2026-03-07T08:00:00.000Z",
  actorUserId: "2772c203-5df5-4967-9341-09e391f4cb90",
  deviceId: "device-web-1",
  schemaVersion: 1,
  payload: {
    personId: `person-${eventId}`,
    name: "Name",
    surname: "Surname",
  },
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createSyncClient", () => {
  test("pushes queued events and only acks accepted/duplicate", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    await queue.enqueue(buildEvent("event-1"));
    await queue.enqueue(buildEvent("event-2"));

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          acknowledgements: [
            { eventId: "event-1", status: "accepted" },
            { eventId: "event-2", status: "rejected", reason: "bad payload" },
          ],
          latestCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ events: [], nextCursor: "cursor-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          latestCursor: "cursor-1",
          projectionRefreshedAt: "2026-03-07T08:01:00.000Z",
          projectionCursor: "cursor-1",
        }),
      );

    const client = createSyncClient({
      queue,
      syncStateStore,
      fetchFn,
    });

    const result = await client.runSyncCycle();

    expect(result.acknowledgedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    await expect(queue.pendingCount()).resolves.toBe(1);
    await expect(syncStateStore.getCursor()).resolves.toBe("cursor-1");

    const pushCall = fetchFn.mock.calls[0];
    expect(pushCall?.[0]).toBe("/sync/push");
  });

  test("pull advances cursor when queue is empty", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    await syncStateStore.setCursor("cursor-start");

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ events: [buildEvent("e-1")], nextCursor: "cursor-next" }),
      )
      .mockResolvedValueOnce(jsonResponse({ events: [], nextCursor: "cursor-next" }))
      .mockResolvedValueOnce(
        jsonResponse({
          latestCursor: "cursor-next",
          projectionRefreshedAt: "2026-03-07T08:02:00.000Z",
          projectionCursor: "cursor-next",
        }),
      );

    const client = createSyncClient({
      queue,
      syncStateStore,
      fetchFn,
    });

    const result = await client.runSyncCycle();

    expect(result.pulledCount).toBe(1);
    await expect(syncStateStore.getCursor()).resolves.toBe("cursor-next");
  });

  test("throws deterministic error and leaves queue untouched on push failure", async () => {
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    await queue.enqueue(buildEvent("event-1"));

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500));

    const client = createSyncClient({
      queue,
      syncStateStore,
      fetchFn,
    });

    await expect(client.runSyncCycle()).rejects.toThrow("Sync push failed with status 500");
    await expect(queue.pendingCount()).resolves.toBe(1);
  });
});
