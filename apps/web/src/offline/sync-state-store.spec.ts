import { describe, expect, test } from "vitest";
import { createMemorySyncStateStore } from "./sync-state-store";

describe("createMemorySyncStateStore", () => {
  test("stores and returns cursor and last sync values", async () => {
    const store = createMemorySyncStateStore();
    await expect(store.getCursor()).resolves.toBeNull();
    await expect(store.getLastSyncAt()).resolves.toBeNull();

    await store.setCursor("cursor-1");
    await store.setLastSyncAt("2026-03-08T08:00:00.000Z");

    await expect(store.getCursor()).resolves.toBe("cursor-1");
    await expect(store.getLastSyncAt()).resolves.toBe("2026-03-08T08:00:00.000Z");
  });

  test("supports clearing cursor and last sync values", async () => {
    const store = createMemorySyncStateStore();
    await store.setCursor("cursor-2");
    await store.setLastSyncAt("2026-03-08T08:01:00.000Z");

    await store.setCursor(null);
    await store.setLastSyncAt(null);

    await expect(store.getCursor()).resolves.toBeNull();
    await expect(store.getLastSyncAt()).resolves.toBeNull();
  });
});
