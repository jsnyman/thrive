import { describe, expect, test, vi } from "vitest";
import type { EventQueueStore } from "./event-queue";
import { createMemoryEventQueueStore } from "./event-queue";
import { createDefaultEventQueue } from "./event-queue-provider";

const mockedSqliteModule = vi.hoisted(() => {
  return {
    createSqliteEventQueueStore: vi.fn<() => Promise<EventQueueStore>>(),
  };
});

vi.mock("./event-queue-sqlite", () => mockedSqliteModule);

describe("createDefaultEventQueue", () => {
  test("returns a queue when sqlite store init succeeds", async () => {
    mockedSqliteModule.createSqliteEventQueueStore.mockResolvedValue(createMemoryEventQueueStore());

    const queue = await createDefaultEventQueue();
    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  test("throws contextual error when sqlite store init fails", async () => {
    mockedSqliteModule.createSqliteEventQueueStore.mockRejectedValue(new Error("boom"));

    await expect(createDefaultEventQueue()).rejects.toThrow(
      "Failed to initialize OPFS SQLite event queue: boom",
    );
  });
});
