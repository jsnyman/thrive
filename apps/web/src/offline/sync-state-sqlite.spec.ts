import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSqliteSyncStateStore } from "./sync-state-sqlite";

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "state.get"; key: string }
  | { id: number; type: "state.set"; key: string; value: string | null };

type WorkerResponse =
  | { id: number; ok: true; type: "init" | "state.set" }
  | { id: number; ok: true; type: "state.get"; value: string | null }
  | { id: number; ok: false; error: string };

const state = new Map<string, string | null>();

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
    if (message.type === "init") {
      this.emit({ id: message.id, ok: true, type: "init" });
      return;
    }

    if (message.type === "state.get") {
      this.emit({
        id: message.id,
        ok: true,
        type: "state.get",
        value: state.has(message.key) ? (state.get(message.key) ?? null) : null,
      });
      return;
    }

    state.set(message.key, message.value);
    this.emit({ id: message.id, ok: true, type: "state.set" });
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

beforeEach(() => {
  state.clear();
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSqliteSyncStateStore", () => {
  test("persists cursor across recreation", async () => {
    const storeA = await createSqliteSyncStateStore();
    await storeA.setCursor("cursor-1");

    const storeB = await createSqliteSyncStateStore();
    await expect(storeB.getCursor()).resolves.toBe("cursor-1");
  });

  test("returns null for blank values", async () => {
    state.set("sync.cursor", "");

    const store = await createSqliteSyncStateStore();
    await expect(store.getCursor()).resolves.toBeNull();
  });
});
