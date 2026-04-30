import type { SyncCursor } from "../../../../packages/shared/src/domain/sync";
import type { SyncStateStore } from "./sync-state-store";
import { getSharedWorkerClient } from "./sqlite-worker-client";

const CURSOR_KEY = "sync.cursor";
const LAST_SYNC_AT_KEY = "sync.lastSyncAt";

export const createSqliteSyncStateStore = async (): Promise<SyncStateStore> => {
  const client = getSharedWorkerClient();
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
