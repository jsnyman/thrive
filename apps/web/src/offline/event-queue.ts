import type { Event } from "../../../../packages/shared/src/domain/events";

export type EventQueueStore = {
  load: () => Promise<Event[]>;
  save: (events: Event[]) => Promise<void>;
  clear: () => Promise<void>;
};

export type EventQueue = {
  enqueue: (event: Event) => Promise<void>;
  dequeueBatch: (maxEvents: number) => Promise<Event[]>;
  ack: (eventIds: string[]) => Promise<void>;
  pendingCount: () => Promise<number>;
};

export const createMemoryEventQueueStore = (): EventQueueStore => {
  let events: Event[] = [];
  return {
    load: async () => [...events],
    save: async (nextEvents) => {
      events = [...nextEvents];
    },
    clear: async () => {
      events = [];
    },
  };
};

export const createEventQueue = (store: EventQueueStore): EventQueue => {
  const enqueue = async (event: Event): Promise<void> => {
    const existing = await store.load();
    await store.save([...existing, event]);
  };

  const dequeueBatch = async (maxEvents: number): Promise<Event[]> => {
    const existing = await store.load();
    if (maxEvents <= 0) {
      return [];
    }
    return existing.slice(0, maxEvents);
  };

  const ack = async (eventIds: string[]): Promise<void> => {
    const existing = await store.load();
    if (eventIds.length === 0) {
      return;
    }
    const idSet = new Set(eventIds);
    await store.save(existing.filter((event) => !idSet.has(event.eventId)));
  };

  const pendingCount = async (): Promise<number> => {
    const existing = await store.load();
    return existing.length;
  };

  return {
    enqueue,
    dequeueBatch,
    ack,
    pendingCount,
  };
};
