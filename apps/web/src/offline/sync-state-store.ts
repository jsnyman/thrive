import type { SyncCursor } from "../../../../packages/shared/src/domain/sync";

export type SyncStateStore = {
  getCursor: () => Promise<SyncCursor | null>;
  setCursor: (cursor: SyncCursor | null) => Promise<void>;
  getLastSyncAt: () => Promise<string | null>;
  setLastSyncAt: (value: string | null) => Promise<void>;
};

export const createMemorySyncStateStore = (): SyncStateStore => {
  let cursor: SyncCursor | null = null;
  let lastSyncAt: string | null = null;

  return {
    getCursor: async () => cursor,
    setCursor: async (nextCursor) => {
      cursor = nextCursor;
    },
    getLastSyncAt: async () => lastSyncAt,
    setLastSyncAt: async (value) => {
      lastSyncAt = value;
    },
  };
};
