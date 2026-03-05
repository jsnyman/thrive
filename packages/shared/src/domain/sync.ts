import type { Event } from "./events";

export type SyncCursor = string;

export type SyncPushRequest = {
  events: Event[];
  lastKnownCursor?: SyncCursor | null;
};

export type SyncPushAck = {
  eventId: string;
  status: "accepted" | "duplicate" | "rejected";
  reason?: string;
};

export type SyncPushResponse = {
  acknowledgements: SyncPushAck[];
  latestCursor: SyncCursor | null;
};

export type SyncPullResponse = {
  events: Event[];
  nextCursor: SyncCursor | null;
};

export type SyncStatusResponse = {
  latestCursor: SyncCursor | null;
  projectionRefreshedAt: string | null;
  projectionCursor: SyncCursor | null;
};
