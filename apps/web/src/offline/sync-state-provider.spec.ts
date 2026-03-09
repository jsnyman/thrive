import { describe, expect, test, vi } from "vitest";
import { createMemorySyncStateStore } from "./sync-state-store";
import { createDefaultSyncStateStore } from "./sync-state-provider";

const mockedSqliteStateModule = vi.hoisted(() => {
  return {
    createSqliteSyncStateStore: vi.fn(),
  };
});

vi.mock("./sync-state-sqlite", () => mockedSqliteStateModule);

describe("createDefaultSyncStateStore", () => {
  test("returns sqlite sync state store when initialization succeeds", async () => {
    mockedSqliteStateModule.createSqliteSyncStateStore.mockResolvedValue(
      createMemorySyncStateStore(),
    );

    const store = await createDefaultSyncStateStore();
    await expect(store.getCursor()).resolves.toBeNull();
  });

  test("throws contextual error when initialization fails", async () => {
    mockedSqliteStateModule.createSqliteSyncStateStore.mockRejectedValue(new Error("boom"));

    await expect(createDefaultSyncStateStore()).rejects.toThrow(
      "Failed to initialize OPFS SQLite sync state store: boom",
    );
  });
});
