import { createPrismaClient } from "../prisma";
import { createCoreRepository } from "../data/core-repository";
import {
  HEUWELKROON_PARKIE_NAME,
  backfillHeuwelkroonParkie,
} from "./backfill-heuwelkroon-parkie-lib";

const run = async (): Promise<void> => {
  const actorUsername = process.env["STAFF_ACTOR_USERNAME"];
  if (actorUsername === undefined || actorUsername.trim().length === 0) {
    throw new Error("STAFF_ACTOR_USERNAME is required (an existing staff username to act as).");
  }
  const dryRun = process.argv.includes("--dry-run");

  const prisma = createPrismaClient();
  try {
    const actor = await prisma.staffUser.findUnique({ where: { username: actorUsername } });
    if (actor === null) {
      throw new Error(`No staff user found with username "${actorUsername}".`);
    }

    const repository = createCoreRepository(prisma);
    const result = await backfillHeuwelkroonParkie(repository, actor.id, { dryRun });

    if (result.collectionPointCreated) {
      console.log(
        dryRun
          ? `Would create collection point "${HEUWELKROON_PARKIE_NAME}".`
          : `Created collection point "${HEUWELKROON_PARKIE_NAME}" (${result.collectionPointId}).`,
      );
    } else {
      console.log(
        `Collection point "${HEUWELKROON_PARKIE_NAME}" already exists (${result.collectionPointId}).`,
      );
    }
    console.log(
      dryRun
        ? `Would backfill ${result.peopleBackfilled.length} person(s); ${result.peopleAlreadyAssigned.length} already assigned elsewhere.`
        : `Backfilled ${result.peopleBackfilled.length} person(s); ${result.peopleAlreadyAssigned.length} already assigned elsewhere.`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

void run();
