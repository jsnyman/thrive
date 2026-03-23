import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createEventQueue } from "./event-queue";
import { createSqliteEventQueueStore } from "./event-queue-sqlite";
import workerSource from "./event-queue-sqlite.worker.ts?raw";

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "load" }
  | {
      id: number;
      type: "save";
      entries: Array<{
        eventId: string;
        eventJson: string;
        enqueuedAt: string;
      }>;
    }
  | { id: number; type: "clear" };

type WorkerResponse =
  | {
      id: number;
      ok: true;
      type: "load";
      entries: Array<{
        eventId: string;
        eventJson: string;
        enqueuedAt: string;
      }>;
    }
  | { id: number; ok: true; type: "init" | "save" | "clear" }
  | { id: number; ok: false; error: string };

const persistedEntries: Array<{ eventId: string; eventJson: string; enqueuedAt: string }> = [];

let failNextInit = false;

class FakeWorker {
  private readonly listeners = new Set<(event: MessageEvent<WorkerResponse>) => void>();

  addEventListener(type: "message", callback: (event: MessageEvent<WorkerResponse>) => void): void {
    if (type === "message") {
      this.listeners.add(callback);
    }
  }

  removeEventListener(
    type: "message",
    callback: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    if (type === "message") {
      this.listeners.delete(callback);
    }
  }

  postMessage(message: WorkerRequest): void {
    if (message.type === "init" && failNextInit) {
      failNextInit = false;
      this.emit({ id: message.id, ok: false, error: "init failed" });
      return;
    }

    if (message.type === "load") {
      this.emit({
        id: message.id,
        ok: true,
        type: "load",
        entries: [...persistedEntries],
      });
      return;
    }

    if (message.type === "save") {
      persistedEntries.splice(0, persistedEntries.length, ...message.entries);
      this.emit({ id: message.id, ok: true, type: "save" });
      return;
    }

    if (message.type === "clear") {
      persistedEntries.splice(0, persistedEntries.length);
      this.emit({ id: message.id, ok: true, type: "clear" });
      return;
    }

    this.emit({ id: message.id, ok: true, type: "init" });
  }

  terminate(): void {
    this.listeners.clear();
  }

  private emit(payload: WorkerResponse): void {
    const event = { data: payload } as MessageEvent<WorkerResponse>;
    queueMicrotask(() => {
      this.listeners.forEach((listener) => {
        listener(event);
      });
    });
  }
}

const buildEvent = (eventId: string): Event => ({
  eventId,
  eventType: "person.created",
  occurredAt: "2026-03-06T10:00:00.000Z",
  actorUserId: "2772c203-5df5-4967-9341-09e391f4cb90",
  deviceId: "device-web-1",
  schemaVersion: 1,
  payload: {
    personId: `person-${eventId}`,
    name: "Test",
    surname: "User",
  },
});

beforeEach(() => {
  persistedEntries.splice(0, persistedEntries.length);
  failNextInit = false;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSqliteEventQueueStore", () => {
  test("uses the async wa-sqlite build in the OPFS worker", async () => {
    expect(workerSource).toContain("wa-sqlite/dist/wa-sqlite-async.mjs");
    expect(workerSource).not.toContain("wa-sqlite/dist/wa-sqlite.mjs");
  });

  test("persists enqueue/dequeue/ack semantics in insertion order", async () => {
    const queue = createEventQueue(await createSqliteEventQueueStore());
    await queue.enqueue(buildEvent("event-1"));
    await queue.enqueue(buildEvent("event-2"));
    await queue.enqueue(buildEvent("event-3"));

    const dequeued = await queue.dequeueBatch(2);
    expect(dequeued.map((event) => event.eventId)).toEqual(["event-1", "event-2"]);

    await queue.ack(["event-2"]);
    const remaining = await queue.dequeueBatch(10);
    expect(remaining.map((event) => event.eventId)).toEqual(["event-1", "event-3"]);
    await expect(queue.pendingCount()).resolves.toBe(2);
  });

  test("survives store recreation", async () => {
    const queueA = createEventQueue(await createSqliteEventQueueStore());
    await queueA.enqueue(buildEvent("event-a"));
    await queueA.enqueue(buildEvent("event-b"));

    const queueB = createEventQueue(await createSqliteEventQueueStore());
    const events = await queueB.dequeueBatch(10);
    expect(events.map((event) => event.eventId)).toEqual(["event-a", "event-b"]);
  });

  test("throws when worker initialization fails", async () => {
    failNextInit = true;

    await expect(createSqliteEventQueueStore()).rejects.toThrow("init failed");
  });
});
