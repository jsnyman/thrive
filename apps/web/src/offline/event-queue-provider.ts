import { createEventQueue, type EventQueue } from "./event-queue";
import { createSqliteEventQueueStore } from "./event-queue-sqlite";

export const createDefaultEventQueue = async (): Promise<EventQueue> => {
  try {
    const store = await createSqliteEventQueueStore();
    return createEventQueue(store);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize OPFS SQLite event queue: ${message}`);
  }
};
