CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "StaffRole" AS ENUM ('collector', 'shop_operator', 'manager');
CREATE TYPE "EventType" AS ENUM (
  'person.created',
  'person.profile_updated',
  'material_type.created',
  'material_type.updated',
  'item.created',
  'item.updated',
  'staff_user.created',
  'staff_user.role_changed',
  'intake.recorded',
  'sale.recorded',
  'procurement.recorded',
  'expense.recorded',
  'inventory.status_changed',
  'inventory.adjustment_requested',
  'inventory.adjustment_applied',
  'points.adjustment_requested',
  'points.adjustment_applied',
  'conflict.detected',
  'conflict.resolved'
);

CREATE TABLE "Event" (
  "eventId" UUID NOT NULL,
  "eventType" "EventType" NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL,
  "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" UUID NOT NULL,
  "deviceId" TEXT NOT NULL,
  "locationText" TEXT,
  "schemaVersion" INTEGER NOT NULL,
  "correlationId" TEXT,
  "causationId" TEXT,
  "payload" JSONB NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("eventId")
);

CREATE TABLE "StaffUser" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL,
  "passcodeHash" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Person" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "surname" TEXT NOT NULL,
  "idNumber" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialType" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "pointsPerKg" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "pointsPrice" DECIMAL(10,2) NOT NULL,
  "costPrice" DECIMAL(12,2),
  "sku" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffUser_username_key" ON "StaffUser"("username");
CREATE UNIQUE INDEX "MaterialType_name_key" ON "MaterialType"("name");
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");
CREATE INDEX "Event_occurredAt_idx" ON "Event"("occurredAt");
CREATE INDEX "Event_actorUserId_idx" ON "Event"("actorUserId");
CREATE INDEX "Item_name_idx" ON "Item"("name");
