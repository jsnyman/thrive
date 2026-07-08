import { randomUUID } from "node:crypto";
import type { Event } from "../../../../packages/shared/src/domain/events";
import { HEUWELKROON_PARKIE_NAME } from "../data/historical-location";

export { HEUWELKROON_PARKIE_NAME };

const DEVICE_ID = "bulk-script:backfill-heuwelkroon-parkie";

type AppendEventResult = {
  status: "accepted" | "duplicate" | "rejected";
  reason?: string;
};

export type BackfillCollectionPointRecord = {
  id: string;
  name: string;
};

export type BackfillPersonRecord = {
  id: string;
  assignedCollectionPointId?: string | null;
};

export type BackfillDependencies = {
  listCollectionPoints: () => Promise<BackfillCollectionPointRecord[]>;
  listPeople: () => Promise<BackfillPersonRecord[]>;
  appendEventAndProject: (event: Event) => Promise<AppendEventResult>;
  now?: () => Date;
};

export type BackfillOptions = {
  dryRun?: boolean;
};

export type BackfillResult = {
  dryRun: boolean;
  collectionPointId: string | null;
  collectionPointCreated: boolean;
  peopleBackfilled: string[];
  peopleAlreadyAssigned: string[];
};

const isUnassigned = (person: BackfillPersonRecord): boolean =>
  person.assignedCollectionPointId === null || person.assignedCollectionPointId === undefined;

export const backfillHeuwelkroonParkie = async (
  dependencies: BackfillDependencies,
  actorUserId: string,
  options?: BackfillOptions,
): Promise<BackfillResult> => {
  const dryRun = options?.dryRun ?? false;
  const occurredAt = (dependencies.now?.() ?? new Date()).toISOString();

  const existingCollectionPoints = await dependencies.listCollectionPoints();
  const existing = existingCollectionPoints.find(
    (collectionPoint) => collectionPoint.name === HEUWELKROON_PARKIE_NAME,
  );

  let collectionPointId: string | null = existing?.id ?? null;
  const collectionPointCreated = existing === undefined;

  if (existing === undefined && !dryRun) {
    const newCollectionPointId = randomUUID();
    const event: Event = {
      eventId: randomUUID(),
      eventType: "collection_point.created",
      occurredAt,
      actorUserId,
      deviceId: DEVICE_ID,
      schemaVersion: 1,
      correlationId: null,
      causationId: null,
      locationText: null,
      payload: {
        collectionPointId: newCollectionPointId,
        name: HEUWELKROON_PARKIE_NAME,
      },
    };
    const result = await dependencies.appendEventAndProject(event);
    if (result.status !== "accepted") {
      throw new Error(
        `Failed to create collection point "${HEUWELKROON_PARKIE_NAME}": ${result.status} ${result.reason ?? ""}`,
      );
    }
    collectionPointId = newCollectionPointId;
  }

  const people = await dependencies.listPeople();
  const peopleToBackfill = people.filter(isUnassigned);
  const peopleAlreadyAssigned = people.filter((person) => !isUnassigned(person)).map((p) => p.id);

  const peopleBackfilled: string[] = [];
  for (const person of peopleToBackfill) {
    if (dryRun) {
      peopleBackfilled.push(person.id);
      continue;
    }
    if (collectionPointId === null) {
      throw new Error("Cannot backfill people without a resolved collection point id");
    }
    const event: Event = {
      eventId: randomUUID(),
      eventType: "person.profile_updated",
      occurredAt,
      actorUserId,
      deviceId: DEVICE_ID,
      schemaVersion: 1,
      correlationId: null,
      causationId: null,
      locationText: null,
      payload: {
        personId: person.id,
        updates: {
          assignedCollectionPointId: collectionPointId,
        },
      },
    };
    const result = await dependencies.appendEventAndProject(event);
    if (result.status !== "accepted") {
      throw new Error(
        `Failed to backfill person "${person.id}": ${result.status} ${result.reason ?? ""}`,
      );
    }
    peopleBackfilled.push(person.id);
  }

  return {
    dryRun,
    collectionPointId,
    collectionPointCreated,
    peopleBackfilled,
    peopleAlreadyAssigned,
  };
};
