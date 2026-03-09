import type { Event } from "../../../../packages/shared/src/domain/events";
import { validateEvent } from "../../../../packages/shared/src/domain/validation";
import type { EventQueueStore } from "./event-queue";

type StoredQueueEntry = {
  eventId: string;
  eventJson: string;
  enqueuedAt: string;
};

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "load" }
  | { id: number; type: "save"; entries: StoredQueueEntry[] }
  | { id: number; type: "clear" };

type WorkerCommand =
  | { type: "init" }
  | { type: "load" }
  | { type: "save"; entries: StoredQueueEntry[] }
  | { type: "clear" };

type WorkerSuccessResponse =
  | { id: number; ok: true; type: "init" | "save" | "clear" }
  | { id: number; ok: true; type: "load"; entries: StoredQueueEntry[] };

type WorkerFailureResponse = { id: number; ok: false; error: string };

type WorkerResponse = WorkerSuccessResponse | WorkerFailureResponse;

type PendingRequest = {
  resolve: (response: WorkerSuccessResponse) => void;
  reject: (error: Error) => void;
};

const parseStoredEvent = (eventJson: string): Event => {
  const parsed = JSON.parse(eventJson) as unknown;
  const result = validateEvent(parsed);
  if (!result.ok) {
    const firstIssue = result.issues[0];
    const reason = firstIssue?.message ?? "Stored event failed validation";
    throw new Error(reason);
  }
  return result.value;
};

const createWorkerClient = (): {
  init: () => Promise<void>;
  load: () => Promise<Event[]>;
  save: (events: Event[]) => Promise<void>;
  clear: () => Promise<void>;
} => {
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

  const post = async (command: WorkerCommand): Promise<WorkerSuccessResponse> => {
    const id = nextId;
    nextId += 1;

    const promise = new Promise<WorkerSuccessResponse>((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
      });
    });

    if (command.type === "save") {
      worker.postMessage({
        id,
        type: "save",
        entries: command.entries,
      } satisfies WorkerRequest);
    } else {
      worker.postMessage({
        id,
        type: command.type,
      } satisfies WorkerRequest);
    }

    return promise;
  };

  const init = async (): Promise<void> => {
    await post({ type: "init" });
  };

  const load = async (): Promise<Event[]> => {
    const response = await post({ type: "load" });
    if (response.type !== "load") {
      throw new Error("Unexpected worker response");
    }
    return response.entries.map((entry) => parseStoredEvent(entry.eventJson));
  };

  const save = async (events: Event[]): Promise<void> => {
    const now = new Date().toISOString();
    const entries = events.map((event) => ({
      eventId: event.eventId,
      eventJson: JSON.stringify(event),
      enqueuedAt: now,
    }));

    await post({
      type: "save",
      entries,
    });
  };

  const clear = async (): Promise<void> => {
    await post({ type: "clear" });
  };

  return {
    init,
    load,
    save,
    clear,
  };
};

export const createSqliteEventQueueStore = async (): Promise<EventQueueStore> => {
  const workerClient = createWorkerClient();
  await workerClient.init();

  return {
    load: workerClient.load,
    save: workerClient.save,
    clear: workerClient.clear,
  };
};
