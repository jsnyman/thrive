import type { Event } from "../../../../packages/shared/src/domain/events";
import {
  HEUWELKROON_PARKIE_NAME,
  backfillHeuwelkroonParkie,
  type BackfillCollectionPointRecord,
  type BackfillPersonRecord,
} from "./backfill-heuwelkroon-parkie-lib";

const actorUserId = "2772c203-5df5-4967-9341-09e391f4cb90";
const now = new Date("2026-07-07T09:00:00.000Z");

type Harness = {
  collectionPoints: BackfillCollectionPointRecord[];
  people: BackfillPersonRecord[];
  appendedEvents: Event[];
  listCollectionPoints: () => Promise<BackfillCollectionPointRecord[]>;
  listPeople: () => Promise<BackfillPersonRecord[]>;
  appendEventAndProject: (
    event: Event,
  ) => Promise<{ status: "accepted" | "duplicate" | "rejected"; reason?: string }>;
  now: () => Date;
};

const createHarness = (options?: {
  collectionPoints?: BackfillCollectionPointRecord[];
  people?: BackfillPersonRecord[];
}): Harness => {
  const collectionPoints = options?.collectionPoints ?? [];
  const people = options?.people ?? [];
  const appendedEvents: Event[] = [];
  return {
    collectionPoints,
    people,
    appendedEvents,
    listCollectionPoints: async () => collectionPoints,
    listPeople: async () => people,
    now: () => now,
    appendEventAndProject: async (event) => {
      appendedEvents.push(event);
      if (event.eventType === "collection_point.created") {
        collectionPoints.push({ id: event.payload.collectionPointId, name: event.payload.name });
      }
      if (event.eventType === "person.profile_updated") {
        const person = people.find((p) => p.id === event.payload.personId);
        if (person !== undefined && event.payload.updates.assignedCollectionPointId !== undefined) {
          person.assignedCollectionPointId = event.payload.updates.assignedCollectionPointId;
        }
      }
      return { status: "accepted" };
    },
  };
};

describe("backfillHeuwelkroonParkie", () => {
  test("creates the collection point and backfills unassigned people", async () => {
    const harness = createHarness({
      people: [{ id: "person-1", assignedCollectionPointId: null }, { id: "person-2" }],
    });

    const result = await backfillHeuwelkroonParkie(harness, actorUserId);

    expect(result.collectionPointCreated).toBe(true);
    expect(result.collectionPointId).not.toBeNull();
    expect(result.peopleBackfilled.sort()).toEqual(["person-1", "person-2"]);
    expect(result.peopleAlreadyAssigned).toEqual([]);
    expect(harness.collectionPoints).toEqual([
      { id: result.collectionPointId, name: HEUWELKROON_PARKIE_NAME },
    ]);
    expect(
      harness.people.every((p) => p.assignedCollectionPointId === result.collectionPointId),
    ).toBe(true);
  });

  test("does not touch people who already have an assigned collection point", async () => {
    const harness = createHarness({
      collectionPoints: [{ id: "cp-existing", name: HEUWELKROON_PARKIE_NAME }],
      people: [
        { id: "person-1", assignedCollectionPointId: null },
        { id: "person-2", assignedCollectionPointId: "cp-other" },
      ],
    });

    const result = await backfillHeuwelkroonParkie(harness, actorUserId);

    expect(result.collectionPointCreated).toBe(false);
    expect(result.collectionPointId).toBe("cp-existing");
    expect(result.peopleBackfilled).toEqual(["person-1"]);
    expect(result.peopleAlreadyAssigned).toEqual(["person-2"]);
    expect(harness.people.find((p) => p.id === "person-2")?.assignedCollectionPointId).toBe(
      "cp-other",
    );
  });

  test("is idempotent — a second run with no unassigned people left is a no-op", async () => {
    const harness = createHarness({
      people: [{ id: "person-1", assignedCollectionPointId: null }],
    });

    const first = await backfillHeuwelkroonParkie(harness, actorUserId);
    expect(first.peopleBackfilled).toEqual(["person-1"]);
    expect(harness.appendedEvents).toHaveLength(2); // collection_point.created + 1 person update

    const second = await backfillHeuwelkroonParkie(harness, actorUserId);

    expect(second.collectionPointCreated).toBe(false);
    expect(second.collectionPointId).toBe(first.collectionPointId);
    expect(second.peopleBackfilled).toEqual([]);
    expect(second.peopleAlreadyAssigned).toEqual(["person-1"]);
    expect(harness.appendedEvents).toHaveLength(2); // no new events appended on rerun
  });

  test("dry run reports intended changes without appending any events", async () => {
    const harness = createHarness({
      people: [
        { id: "person-1", assignedCollectionPointId: null },
        { id: "person-2", assignedCollectionPointId: "cp-other" },
      ],
    });

    const result = await backfillHeuwelkroonParkie(harness, actorUserId, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.collectionPointCreated).toBe(true);
    expect(result.collectionPointId).toBeNull();
    expect(result.peopleBackfilled).toEqual(["person-1"]);
    expect(result.peopleAlreadyAssigned).toEqual(["person-2"]);
    expect(harness.appendedEvents).toEqual([]);
    expect(harness.collectionPoints).toEqual([]);
    expect(harness.people.find((p) => p.id === "person-1")?.assignedCollectionPointId).toBeNull();
  });

  test("dry run against an already-migrated state reports zero pending changes", async () => {
    const harness = createHarness({
      collectionPoints: [{ id: "cp-existing", name: HEUWELKROON_PARKIE_NAME }],
      people: [{ id: "person-1", assignedCollectionPointId: "cp-existing" }],
    });

    const result = await backfillHeuwelkroonParkie(harness, actorUserId, { dryRun: true });

    expect(result.collectionPointCreated).toBe(false);
    expect(result.collectionPointId).toBe("cp-existing");
    expect(result.peopleBackfilled).toEqual([]);
    expect(result.peopleAlreadyAssigned).toEqual(["person-1"]);
    expect(harness.appendedEvents).toEqual([]);
  });

  test("throws when collection point creation is rejected", async () => {
    const harness = createHarness({
      people: [{ id: "person-1", assignedCollectionPointId: null }],
    });
    harness.appendEventAndProject = async () => ({
      status: "rejected" as const,
      reason: "ENTITY_ALREADY_EXISTS",
    });

    await expect(backfillHeuwelkroonParkie(harness, actorUserId)).rejects.toThrow(
      /Failed to create collection point/,
    );
  });
});
