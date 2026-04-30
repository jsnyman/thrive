type StoredQueueEntry = {
  eventId: string;
  eventJson: string;
  enqueuedAt: string;
};

type WorkerCommand =
  | { type: "init" }
  | { type: "load" }
  | { type: "save"; entries: StoredQueueEntry[] }
  | { type: "clear" }
  | { type: "state.get"; key: string }
  | { type: "state.set"; key: string; value: string | null };

type WorkerRequest = WorkerCommand & { id: number };

type WorkerResponse =
  | { id: number; ok: true; type: "init" | "save" | "clear" | "state.set" }
  | { id: number; ok: true; type: "load"; entries: StoredQueueEntry[] }
  | { id: number; ok: true; type: "state.get"; value: string | null }
  | { id: number; ok: false; error: string };

type PendingRequest = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

export type SharedWorkerClient = {
  init: () => Promise<void>;
  load: () => Promise<StoredQueueEntry[]>;
  save: (entries: StoredQueueEntry[]) => Promise<void>;
  clear: () => Promise<void>;
  getValue: (key: string) => Promise<string | null>;
  setValue: (key: string, value: string | null) => Promise<void>;
};

const createWorkerClient = (): SharedWorkerClient => {
  if (typeof Worker === "undefined") {
    throw new Error("Web Worker is not available");
  }

  const worker = new Worker(new URL("./event-queue-sqlite.worker.ts", import.meta.url), {
    type: "module",
  });

  const pending = new Map<number, PendingRequest>();
  let nextId = 1;

  const failAll = (reason: string): void => {
    pending.forEach((request) => {
      request.reject(new Error(reason));
    });
    pending.clear();
  };

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

  worker.addEventListener("error", () => {
    failAll("SQLite worker error");
  });

  const post = async (command: WorkerCommand): Promise<WorkerResponse> => {
    const id = nextId;
    nextId += 1;

    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });

    worker.postMessage({ ...command, id } satisfies WorkerRequest);
    return promise;
  };

  return {
    init: async (): Promise<void> => {
      await post({ type: "init" });
    },
    load: async (): Promise<StoredQueueEntry[]> => {
      const response = await post({ type: "load" });
      if (!response.ok || response.type !== "load") {
        throw new Error("Unexpected worker response");
      }
      return response.entries;
    },
    save: async (entries: StoredQueueEntry[]): Promise<void> => {
      await post({ type: "save", entries });
    },
    clear: async (): Promise<void> => {
      await post({ type: "clear" });
    },
    getValue: async (key: string): Promise<string | null> => {
      const response = await post({ type: "state.get", key });
      if (!response.ok || response.type !== "state.get") {
        throw new Error("Unexpected worker response");
      }
      return response.value;
    },
    setValue: async (key: string, value: string | null): Promise<void> => {
      await post({ type: "state.set", key, value });
    },
  };
};

let instance: SharedWorkerClient | null = null;

export const getSharedWorkerClient = (): SharedWorkerClient => {
  if (instance === null) {
    instance = createWorkerClient();
  }
  return instance;
};
