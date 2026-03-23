/// <reference lib="WebWorker" />

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { Factory as createSqliteApi } from "wa-sqlite";
import { OriginPrivateFileSystemVFS } from "wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js";

type StoredQueueEntry = {
  eventId: string;
  eventJson: string;
  enqueuedAt: string;
};

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "load" }
  | { id: number; type: "save"; entries: StoredQueueEntry[] }
  | { id: number; type: "clear" }
  | { id: number; type: "state.get"; key: string }
  | { id: number; type: "state.set"; key: string; value: string | null };

type WorkerResponse =
  | { id: number; ok: true; type: "init" | "save" | "clear" | "state.set" }
  | { id: number; ok: true; type: "load"; entries: StoredQueueEntry[] }
  | { id: number; ok: true; type: "state.get"; value: string | null }
  | { id: number; ok: false; error: string };

type SqliteVfs = {
  readonly name: string;
};

type SqliteApi = {
  vfs_register: (vfs: SqliteVfs, makeDefault?: boolean) => number;
  open_v2: (name: string, flags?: number, vfsName?: string) => Promise<number>;
  exec: (
    db: number,
    sql: string,
    callback?: (row: unknown[], columns: string[]) => void,
  ) => Promise<void>;
  execWithParams: (
    db: number,
    sql: string,
    params: Array<string | number | null>,
  ) => Promise<unknown>;
};

const SQLITE_OPEN_READWRITE = 0x00000002;
const SQLITE_OPEN_CREATE = 0x00000004;
const OPFS_VFS_NAME = "opfs";
const DATABASE_NAME = "recycling-event-queue.sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS queued_event (
  sort_key INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  enqueued_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS queued_event_event_id_idx ON queued_event(event_id);
CREATE INDEX IF NOT EXISTS queued_event_sort_key_idx ON queued_event(sort_key);
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

let sqliteApi: SqliteApi | null = null;
let databaseId: number | null = null;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const requireApi = async (): Promise<SqliteApi> => {
  if (sqliteApi !== null) {
    return sqliteApi;
  }

  if (navigator.storage?.getDirectory === undefined) {
    throw new Error("OPFS is not available in this environment");
  }

  const moduleFactory = SQLiteESMFactory as unknown as (config?: object) => Promise<unknown>;
  const module = await moduleFactory();
  const apiFactory = createSqliteApi as unknown as (runtimeModule: unknown) => SqliteApi;
  const api = apiFactory(module);

  const registerCode = api.vfs_register(
    new OriginPrivateFileSystemVFS() as unknown as SqliteVfs,
    true,
  );
  if (registerCode !== 0) {
    throw new Error(`Failed to register OPFS VFS: ${String(registerCode)}`);
  }

  sqliteApi = api;
  return api;
};

const requireDatabase = async (): Promise<{ api: SqliteApi; db: number }> => {
  const api = await requireApi();
  if (databaseId === null) {
    const openedDb = await api.open_v2(
      DATABASE_NAME,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      OPFS_VFS_NAME,
    );
    databaseId = openedDb;
    await api.exec(openedDb, SCHEMA_SQL);
  }

  return {
    api,
    db: databaseId,
  };
};

const postResponse = (response: WorkerResponse): void => {
  self.postMessage(response);
};

const handleInit = async (requestId: number): Promise<void> => {
  await requireDatabase();
  postResponse({ id: requestId, ok: true, type: "init" });
};

const handleLoad = async (requestId: number): Promise<void> => {
  const { api, db } = await requireDatabase();
  const entries: StoredQueueEntry[] = [];

  await api.exec(
    db,
    "SELECT event_id, event_json, enqueued_at FROM queued_event ORDER BY sort_key ASC",
    (row, columns) => {
      const eventIdIndex = columns.indexOf("event_id");
      const eventJsonIndex = columns.indexOf("event_json");
      const enqueuedAtIndex = columns.indexOf("enqueued_at");

      const eventIdValue = eventIdIndex >= 0 ? row[eventIdIndex] : null;
      const eventJsonValue = eventJsonIndex >= 0 ? row[eventJsonIndex] : null;
      const enqueuedAtValue = enqueuedAtIndex >= 0 ? row[enqueuedAtIndex] : null;

      if (
        typeof eventIdValue === "string" &&
        typeof eventJsonValue === "string" &&
        typeof enqueuedAtValue === "string"
      ) {
        entries.push({
          eventId: eventIdValue,
          eventJson: eventJsonValue,
          enqueuedAt: enqueuedAtValue,
        });
      }
    },
  );

  postResponse({ id: requestId, ok: true, type: "load", entries });
};

const handleSave = async (requestId: number, entries: StoredQueueEntry[]): Promise<void> => {
  const { api, db } = await requireDatabase();

  await api.exec(db, "BEGIN IMMEDIATE TRANSACTION");
  try {
    await api.exec(db, "DELETE FROM queued_event");
    for (const entry of entries) {
      await api.execWithParams(
        db,
        "INSERT INTO queued_event(event_id, event_json, enqueued_at) VALUES (?, ?, ?)",
        [entry.eventId, entry.eventJson, entry.enqueuedAt],
      );
    }
    await api.exec(db, "COMMIT");
    postResponse({ id: requestId, ok: true, type: "save" });
  } catch (error) {
    await api.exec(db, "ROLLBACK");
    throw error;
  }
};

const handleClear = async (requestId: number): Promise<void> => {
  const { api, db } = await requireDatabase();
  await api.exec(db, "DELETE FROM queued_event");
  postResponse({ id: requestId, ok: true, type: "clear" });
};

const handleStateGet = async (requestId: number, key: string): Promise<void> => {
  const { api, db } = await requireDatabase();
  let value: string | null = null;

  await api
    .execWithParams(db, "SELECT value FROM sync_state WHERE key = ? LIMIT 1", [key])
    .then((rowsResult: unknown) => {
      const rows = rowsResult as Array<{ value?: unknown }>;
      const first = rows[0];
      if (first !== undefined && typeof first.value === "string") {
        value = first.value;
      }
    });

  postResponse({ id: requestId, ok: true, type: "state.get", value });
};

const handleStateSet = async (
  requestId: number,
  key: string,
  value: string | null,
): Promise<void> => {
  const { api, db } = await requireDatabase();
  await api.execWithParams(
    db,
    "INSERT INTO sync_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
  postResponse({ id: requestId, ok: true, type: "state.set" });
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  const run = async (): Promise<void> => {
    if (request.type === "init") {
      await handleInit(request.id);
      return;
    }

    if (request.type === "load") {
      await handleLoad(request.id);
      return;
    }

    if (request.type === "save") {
      await handleSave(request.id, request.entries);
      return;
    }

    if (request.type === "clear") {
      await handleClear(request.id);
      return;
    }

    if (request.type === "state.get") {
      await handleStateGet(request.id, request.key);
      return;
    }

    if (request.type === "state.set") {
      await handleStateSet(request.id, request.key, request.value);
    }
  };

  void run().catch((error: unknown) => {
    postResponse({
      id: request.id,
      ok: false,
      error: toErrorMessage(error),
    });
  });
});
