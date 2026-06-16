import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SyncConflictRecord,
  SyncConflictResolution,
} from "../../../../packages/shared/src/domain/sync";
import { createConflictClient } from "./conflict-client";
import type { EventQueue } from "./event-queue";
import { isRecoverableSqliteError } from "./sqlite-recovery";
import { createSyncClient, type SyncRunResult } from "./sync-client";
import type { SyncStateStore } from "./sync-state-store";

export type SyncUiStatus = "idle" | "running" | "success" | "error";

export type SyncViewModel = {
  status: SyncUiStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  errorMessage: string | null;
  lastRun: SyncRunResult | null;
  conflicts: SyncConflictRecord[];
  conflictStatus: "idle" | "loading" | "error" | "ready";
  conflictErrorMessage: string | null;
  resolvingConflictIds: string[];
  syncNow: () => Promise<SyncRunResult | null>;
  refreshConflicts: () => Promise<void>;
  resolveConflict: (
    conflictId: string,
    resolution: SyncConflictResolution,
    notes: string,
  ) => Promise<void>;
};

type UseSyncOptions = {
  queue: EventQueue | null;
  syncStateStore: SyncStateStore | null;
};

const STORAGE_UNAVAILABLE_MESSAGE =
  "Offline storage became unavailable. Reload after clearing site data.";
const AUTO_SYNC_INTERVAL_MS = 15_000;
const SYNC_REQUEST_TIMEOUT_MS = 8_000;
const SYNC_PULL_ITERATION_LIMIT = 2;

const toSyncErrorMessage = (error: unknown): string => {
  if (isRecoverableSqliteError(error)) {
    return STORAGE_UNAVAILABLE_MESSAGE;
  }
  return error instanceof Error ? error.message : String(error);
};

export const useSync = (options: UseSyncOptions): SyncViewModel => {
  const [status, setStatus] = useState<SyncUiStatus>("idle");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<SyncRunResult | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [conflictStatus, setConflictStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle",
  );
  const [conflictErrorMessage, setConflictErrorMessage] = useState<string | null>(null);
  const [resolvingConflictIds, setResolvingConflictIds] = useState<string[]>([]);
  const inFlightSyncRef = useRef<Promise<SyncRunResult | null> | null>(null);

  const client = useMemo(() => {
    if (options.queue === null || options.syncStateStore === null) {
      return null;
    }
    return createSyncClient({
      queue: options.queue,
      syncStateStore: options.syncStateStore,
      timeoutMs: SYNC_REQUEST_TIMEOUT_MS,
      pullIterationLimit: SYNC_PULL_ITERATION_LIMIT,
    });
  }, [options.queue, options.syncStateStore]);

  useEffect(() => {
    const queue = options.queue;
    const syncStateStore = options.syncStateStore;
    if (queue === null || syncStateStore === null) {
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const [count, last] = await Promise.all([
          queue.pendingCount(),
          syncStateStore.getLastSyncAt(),
        ]);
        if (!cancelled) {
          setPendingCount(count);
          setLastSyncAt(last);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toSyncErrorMessage(error));
          setStatus("error");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [options.queue, options.syncStateStore]);

  const refreshConflicts = useCallback(async (): Promise<void> => {
    setConflictStatus("loading");
    setConflictErrorMessage(null);
    try {
      const client = createConflictClient();
      const response = await client.listConflicts("open");
      setConflicts(response.conflicts);
      setConflictStatus("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConflictErrorMessage(message);
      setConflictStatus("error");
    }
  }, []);

  const syncNow = useCallback(async (): Promise<SyncRunResult | null> => {
    const queue = options.queue;
    const syncStateStore = options.syncStateStore;
    if (queue === null || syncStateStore === null || client === null) {
      setErrorMessage("Sync is unavailable");
      setStatus("error");
      return null;
    }

    if (inFlightSyncRef.current !== null) {
      return inFlightSyncRef.current;
    }

    setStatus("running");
    setErrorMessage(null);

    const syncPromise = (async (): Promise<SyncRunResult | null> => {
      try {
        const result = await client.runSyncCycle();
        setLastRun(result);
        setPendingCount(result.pendingCount);
        setLastSyncAt(result.lastSyncAt);
        setStatus("success");
        await refreshConflicts();
        return result;
      } catch (error) {
        setErrorMessage(toSyncErrorMessage(error));
        setStatus("error");
        try {
          setPendingCount(await queue.pendingCount());
        } catch {
          setPendingCount(0);
        }
        return null;
      } finally {
        inFlightSyncRef.current = null;
      }
    })();

    inFlightSyncRef.current = syncPromise;
    return syncPromise;
  }, [client, options.queue, options.syncStateStore, refreshConflicts]);

  useEffect(() => {
    const queue = options.queue;
    const syncStateStore = options.syncStateStore;
    if (queue === null || syncStateStore === null) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      if (inFlightSyncRef.current !== null) {
        return;
      }
      if (pendingCount <= 0) {
        return;
      }
      void syncNow();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [options.queue, options.syncStateStore, pendingCount, syncNow]);

  const resolveConflict = useCallback(
    async (
      conflictId: string,
      resolution: SyncConflictResolution,
      notes: string,
    ): Promise<void> => {
      if (notes.trim().length === 0) {
        setConflictErrorMessage("Resolution notes are required");
        setConflictStatus("error");
        return;
      }
      setResolvingConflictIds((prev) => [...prev, conflictId]);
      setConflictErrorMessage(null);
      try {
        const client = createConflictClient();
        await client.resolveConflict(conflictId, {
          resolution,
          notes,
        });
        await refreshConflicts();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setConflictErrorMessage(message);
        setConflictStatus("error");
      } finally {
        setResolvingConflictIds((prev) => prev.filter((id) => id !== conflictId));
      }
    },
    [refreshConflicts],
  );

  useEffect(() => {
    if (options.queue === null || options.syncStateStore === null) {
      return;
    }
    void refreshConflicts();
  }, [options.queue, options.syncStateStore, refreshConflicts]);

  return {
    status,
    pendingCount,
    lastSyncAt,
    errorMessage,
    lastRun,
    conflicts,
    conflictStatus,
    conflictErrorMessage,
    resolvingConflictIds,
    syncNow,
    refreshConflicts,
    resolveConflict,
  };
};
