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

CREATE TABLE event (
  event_id UUID NOT NULL,
  event_type "EventType" NOT NULL,
  occurred_at TIMESTAMPTZ(6) NOT NULL,
  recorded_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  location_text TEXT,
  schema_version INTEGER NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  payload JSONB NOT NULL,
  CONSTRAINT event_pkey PRIMARY KEY (event_id)
);

CREATE TABLE staff_user (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,
  role "StaffRole" NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_user_pkey PRIMARY KEY (id)
);

CREATE TABLE person (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  id_number TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT person_pkey PRIMARY KEY (id)
);

CREATE TABLE material_type (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  points_per_kg DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT material_type_pkey PRIMARY KEY (id)
);

CREATE TABLE item (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  points_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(12,2),
  sku TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT item_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX staff_user_username_key ON staff_user(username);
CREATE UNIQUE INDEX material_type_name_key ON material_type(name);
CREATE INDEX event_event_type_idx ON event(event_type);
CREATE INDEX event_occurred_at_idx ON event(occurred_at);
CREATE INDEX event_actor_user_id_idx ON event(actor_user_id);
CREATE INDEX item_name_idx ON item(name);
