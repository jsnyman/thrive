CREATE TABLE "material_image" (
  "material_type_id" UUID NOT NULL,
  "content_type" TEXT NOT NULL,
  "file_name" TEXT,
  "byte_size" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "material_image_pkey" PRIMARY KEY ("material_type_id")
);

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'material_type.image_set';
