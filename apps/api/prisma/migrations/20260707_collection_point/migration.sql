ALTER TYPE "EventType" ADD VALUE 'collection_point.created';
ALTER TYPE "EventType" ADD VALUE 'collection_point.updated';

CREATE TABLE "collection_point" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "collection_point_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collection_point_name_key" ON "collection_point"("name");
