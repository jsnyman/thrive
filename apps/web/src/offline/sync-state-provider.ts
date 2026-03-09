import type { SyncStateStore } from "./sync-state-store";
import { createSqliteSyncStateStore } from "./sync-state-sqlite";

export const createDefaultSyncStateStore = async (): Promise<SyncStateStore> => {
  try {
    return await createSqliteSyncStateStore();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize OPFS SQLite sync state store: ${message}`);
  }
};
