import type { Event } from "../../../../packages/shared/src/domain/events";
import { validateEvent } from "../../../../packages/shared/src/domain/validation";
import type { EventQueueStore } from "./event-queue";
import { getSharedWorkerClient } from "./sqlite-worker-client";

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

export const createSqliteEventQueueStore = async (): Promise<EventQueueStore> => {
  const client = getSharedWorkerClient();
  await client.init();

  return {
    load: async (): Promise<Event[]> => {
      const entries = await client.load();
      return entries.map((entry) => parseStoredEvent(entry.eventJson));
    },
    save: async (events: Event[]): Promise<void> => {
      const now = new Date().toISOString();
      const entries = events.map((event) => ({
        eventId: event.eventId,
        eventJson: JSON.stringify(event),
        enqueuedAt: now,
      }));
      await client.save(entries);
    },
    clear: async (): Promise<void> => {
      await client.clear();
    },
  };
};
