import type { SyncCursor } from "../../../../packages/shared/src/domain/sync";
import type { SyncStateStore } from "./sync-state-store";

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "state.get"; key: string }
  | { id: number; type: "state.set"; key: string; value: string | null };

type WorkerCommand =
  | { type: "init" }
  | { type: "state.get"; key: string }
  | { type: "state.set"; key: string; value: string | null };

type WorkerResponse =
  | { id: number; ok: true; type: "init" | "state.set" }
  | { id: number; ok: true; type: "state.get"; value: string | null }
  | { id: number; ok: false; error: string };

type PendingRequest = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

const CURSOR_KEY = "sync.cursor";
const LAST_SYNC_AT_KEY = "sync.lastSyncAt";

const createWorkerClient = (): {
  init: () => Promise<void>;
  getValue: (key: string) => Promise<string | null>;
  setValue: (key: string, value: string | null) => Promise<void>;
} => {
  if (typeof Worker === "undefined") {
    throw new Error("Web Worker is not available");
  }

  const worker = new Worker(new URL("./event-queue-sqlite.worker.ts", import.meta.url), {
    type: "module",
  });

  const pending = new Map<number, PendingRequest>();
  let nextId = 1;

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (request === undefined) {
      return;
    }
    pending.delete(response.id);
    if (!response.ok) {
      request.reject(new Error(response.error));
      return;
    }
    request.resolve(response);
  });

  const post = async (command: WorkerCommand): Promise<WorkerResponse> => {
    const id = nextId;
    nextId += 1;

    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
      });
    });

    if (command.type === "state.get") {
      worker.postMessage({ id, type: "state.get", key: command.key } satisfies WorkerRequest);
    } else if (command.type === "state.set") {
      worker.postMessage({
        id,
        type: "state.set",
        key: command.key,
        value: command.value,
      } satisfies WorkerRequest);
    } else {
      worker.postMessage({ id, type: "init" } satisfies WorkerRequest);
    }

    return promise;
  };

  return {
    init: async (): Promise<void> => {
      const response = await post({ type: "init" });
      if (!response.ok || response.type !== "init") {
        throw new Error("Failed to initialize sync state storage");
      }
    },
    getValue: async (key: string): Promise<string | null> => {
      const response = await post({ type: "state.get", key });
      if (!response.ok || response.type !== "state.get") {
        throw new Error("Failed to read sync state");
      }
      return response.value;
    },
    setValue: async (key: string, value: string | null): Promise<void> => {
      const response = await post({ type: "state.set", key, value });
      if (!response.ok || response.type !== "state.set") {
        throw new Error("Failed to write sync state");
      }
    },
  };
};

export const createSqliteSyncStateStore = async (): Promise<SyncStateStore> => {
  const client = createWorkerClient();
  await client.init();

  return {
    getCursor: async (): Promise<SyncCursor | null> => {
      const value = await client.getValue(CURSOR_KEY);
      if (value === null || value.trim().length === 0) {
        return null;
      }
      return value;
    },
    setCursor: async (cursor: SyncCursor | null): Promise<void> => {
      await client.setValue(CURSOR_KEY, cursor);
    },
    getLastSyncAt: async (): Promise<string | null> => {
      const value = await client.getValue(LAST_SYNC_AT_KEY);
      if (value === null || value.trim().length === 0) {
        return null;
      }
      return value;
    },
    setLastSyncAt: async (value: string | null): Promise<void> => {
      await client.setValue(LAST_SYNC_AT_KEY, value);
    },
  };
};
