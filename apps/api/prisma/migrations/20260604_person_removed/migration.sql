ALTER TABLE "person" ADD COLUMN "removed_at" TIMESTAMPTZ(6);

ALTER TYPE "EventType" ADD VALUE 'person.removed';
