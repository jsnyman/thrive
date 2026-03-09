import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SyncRunResult } from "./sync-client";
import { useSync } from "./use-sync";

const syncClientModule = vi.hoisted(() => ({
  createSyncClient: vi.fn(),
}));

const conflictClientModule = vi.hoisted(() => ({
  createConflictClient: vi.fn(),
}));

vi.mock("./sync-client", () => syncClientModule);
vi.mock("./conflict-client", () => conflictClientModule);

const createQueue = () => ({
  enqueue: vi.fn(),
  dequeueBatch: vi.fn(async () => []),
  ack: vi.fn(async () => {
    return;
  }),
  pendingCount: vi.fn(async () => 2),
});

const createSyncStore = () => ({
  getCursor: vi.fn(async () => null),
  setCursor: vi.fn(async () => {
    return;
  }),
  getLastSyncAt: vi.fn(async () => "2026-03-08T08:00:00.000Z"),
  setLastSyncAt: vi.fn(async () => {
    return;
  }),
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSync", () => {
  test("reports unavailable sync when queue/store is missing", async () => {
    const { result } = renderHook(() => useSync({ queue: null, syncStateStore: null }));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("Sync is unavailable");
  });

  test("loads pending metadata and open conflicts on mount", async () => {
    const queue = createQueue();
    const syncStateStore = createSyncStore();

    syncClientModule.createSyncClient.mockReturnValue({
      runSyncCycle: vi.fn(),
    });
    conflictClientModule.createConflictClient.mockReturnValue({
      listConflicts: vi.fn(async () => ({
        conflicts: [],
        nextCursor: null,
      })),
      resolveConflict: vi.fn(),
    });

    const { result } = renderHook(() =>
      useSync({
        queue,
        syncStateStore,
      }),
    );

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    });
    await waitFor(() => {
      expect(result.current.lastSyncAt).toBe("2026-03-08T08:00:00.000Z");
    });
    await waitFor(() => {
      expect(result.current.conflictStatus).toBe("ready");
    });
  });

  test("syncNow updates state on success and refreshes conflicts", async () => {
    const queue = {
      ...createQueue(),
      pendingCount: vi.fn(async () => 0),
    };
    const syncStateStore = createSyncStore();

    const runResult: SyncRunResult = {
      acknowledgedCount: 1,
      rejectedCount: 0,
      pulledCount: 0,
      latestCursor: "cursor-1",
      status: {
        latestCursor: "cursor-1",
        projectionCursor: "cursor-1",
        projectionRefreshedAt: "2026-03-08T08:02:00.000Z",
      },
      pendingCount: 0,
      lastSyncAt: "2026-03-08T08:02:00.000Z",
    };

    const runSyncCycle = vi.fn(async () => runResult);
    const listConflicts = vi.fn(async () => ({ conflicts: [], nextCursor: null }));

    syncClientModule.createSyncClient.mockReturnValue({
      runSyncCycle,
    });
    conflictClientModule.createConflictClient.mockReturnValue({
      listConflicts,
      resolveConflict: vi.fn(),
    });

    const { result } = renderHook(() =>
      useSync({
        queue,
        syncStateStore,
      }),
    );

    await waitFor(() => {
      expect(result.current.conflictStatus).toBe("ready");
    });

    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.lastSyncAt).toBe("2026-03-08T08:02:00.000Z");
    expect(runSyncCycle).toHaveBeenCalledTimes(1);
    expect(listConflicts).toHaveBeenCalled();
  });

  test("resolveConflict validates notes before request", async () => {
    const queue = createQueue();
    const syncStateStore = createSyncStore();
    const resolveConflict = vi.fn();

    syncClientModule.createSyncClient.mockReturnValue({
      runSyncCycle: vi.fn(),
    });
    conflictClientModule.createConflictClient.mockReturnValue({
      listConflicts: vi.fn(async () => ({ conflicts: [], nextCursor: null })),
      resolveConflict,
    });

    const { result } = renderHook(() =>
      useSync({
        queue,
        syncStateStore,
      }),
    );

    await waitFor(() => {
      expect(result.current.conflictStatus).toBe("ready");
    });

    await act(async () => {
      await result.current.resolveConflict("conflict-1", "accepted", "   ");
    });

    expect(resolveConflict).not.toHaveBeenCalled();
    expect(result.current.conflictStatus).toBe("error");
    expect(result.current.conflictErrorMessage).toBe("Resolution notes are required");
  });
});
