import type { EventType } from "./events";

export type JsonSchemaType = "object" | "string" | "number" | "integer" | "array" | "boolean" | "null";

export type JsonSchema = {
  $schema?: string;
  title?: string;
  description?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  minimum?: number;
  minItems?: number;
  format?: string;
};

const nullable = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  type: Array.isArray(schema.type) ? [...schema.type, "null"] : [schema.type ?? "string", "null"],
});

const stringSchema = (options?: Partial<JsonSchema>): JsonSchema => ({
  type: "string",
  ...options,
});

const integerSchema = (options?: Partial<JsonSchema>): JsonSchema => ({
  type: "integer",
  ...options,
});

const numberSchema = (options?: Partial<JsonSchema>): JsonSchema => ({
  type: "number",
  ...options,
});

const arraySchema = (items: JsonSchema, options?: Partial<JsonSchema>): JsonSchema => ({
  type: "array",
  items,
  ...options,
});

const objectSchema = (properties: Record<string, JsonSchema>, required?: string[]): JsonSchema => ({
  type: "object",
  properties,
  ...(required !== undefined && { required }),
  additionalProperties: false,
});

export const EVENT_TYPES: EventType[] = [
  "person.created",
  "person.profile_updated",
  "material_type.created",
  "material_type.updated",
  "item.created",
  "item.updated",
  "staff_user.created",
  "staff_user.role_changed",
  "intake.recorded",
  "sale.recorded",
  "procurement.recorded",
  "expense.recorded",
  "inventory.status_changed",
  "inventory.adjustment_requested",
  "inventory.adjustment_applied",
  "points.adjustment_requested",
  "points.adjustment_applied",
  "conflict.detected",
  "conflict.resolved",
];

const INVENTORY_STATUSES = ["storage", "shop", "sold", "spoiled", "damaged", "missing"];
const INVENTORY_ADJUSTMENT_STATUSES = ["spoiled", "damaged", "missing"];
const STAFF_ROLES = ["collector", "shop_operator", "manager"];

const eventTypeSchema = stringSchema({ enum: EVENT_TYPES });
const inventoryStatusSchema = stringSchema({ enum: INVENTORY_STATUSES });
const inventoryAdjustmentStatusSchema = stringSchema({ enum: INVENTORY_ADJUSTMENT_STATUSES });
const staffRoleSchema = stringSchema({ enum: STAFF_ROLES });

const personCreatedSchema = objectSchema(
  {
    personId: stringSchema(),
    name: stringSchema(),
    surname: stringSchema(),
    idNumber: nullable(stringSchema()),
    phone: nullable(stringSchema()),
    address: nullable(stringSchema()),
    notes: nullable(stringSchema()),
  },
  ["personId", "name", "surname"],
);

const personProfileUpdatedSchema = objectSchema(
  {
    personId: stringSchema(),
    updates: objectSchema(
      {
        name: stringSchema(),
        surname: stringSchema(),
        idNumber: nullable(stringSchema()),
        phone: nullable(stringSchema()),
        address: nullable(stringSchema()),
        notes: nullable(stringSchema()),
      },
      [],
    ),
  },
  ["personId", "updates"],
);

const materialTypeCreatedSchema = objectSchema(
  {
    materialTypeId: stringSchema(),
    name: stringSchema(),
    pointsPerKg: numberSchema({ minimum: 0 }),
  },
  ["materialTypeId", "name", "pointsPerKg"],
);

const materialTypeUpdatedSchema = objectSchema(
  {
    materialTypeId: stringSchema(),
    updates: objectSchema(
      {
        name: stringSchema(),
        pointsPerKg: numberSchema({ minimum: 0 }),
      },
      [],
    ),
  },
  ["materialTypeId", "updates"],
);

const itemCreatedSchema = objectSchema(
  {
    itemId: stringSchema(),
    name: stringSchema(),
    pointsPrice: integerSchema({ minimum: 0 }),
    costPrice: nullable(numberSchema({ minimum: 0 })),
    sku: nullable(stringSchema()),
  },
  ["itemId", "name", "pointsPrice"],
);

const itemUpdatedSchema = objectSchema(
  {
    itemId: stringSchema(),
    updates: objectSchema(
      {
        name: stringSchema(),
        pointsPrice: integerSchema({ minimum: 0 }),
        costPrice: nullable(numberSchema({ minimum: 0 })),
        sku: nullable(stringSchema()),
      },
      [],
    ),
  },
  ["itemId", "updates"],
);

const staffUserCreatedSchema = objectSchema(
  {
    userId: stringSchema(),
    username: stringSchema(),
    role: staffRoleSchema,
  },
  ["userId", "username", "role"],
);

const staffUserRoleChangedSchema = objectSchema(
  {
    userId: stringSchema(),
    fromRole: nullable(staffRoleSchema),
    toRole: staffRoleSchema,
  },
  ["userId", "toRole"],
);

const intakeLineSchema = objectSchema(
  {
    materialTypeId: stringSchema(),
    weightKg: numberSchema({ minimum: 0 }),
    pointsPerKg: numberSchema({ minimum: 0 }),
    pointsAwarded: integerSchema({ minimum: 0 }),
  },
  ["materialTypeId", "weightKg", "pointsPerKg", "pointsAwarded"],
);

const intakeRecordedSchema = objectSchema(
  {
    personId: stringSchema(),
    lines: arraySchema(intakeLineSchema, { minItems: 1 }),
    totalPoints: integerSchema({ minimum: 0 }),
  },
  ["personId", "lines", "totalPoints"],
);

const saleLineSchema = objectSchema(
  {
    itemId: stringSchema(),
    inventoryBatchId: nullable(stringSchema()),
    quantity: integerSchema({ minimum: 0 }),
    pointsPrice: integerSchema({ minimum: 0 }),
    lineTotalPoints: integerSchema({ minimum: 0 }),
  },
  ["itemId", "quantity", "pointsPrice", "lineTotalPoints"],
);

const saleRecordedSchema = objectSchema(
  {
    personId: stringSchema(),
    lines: arraySchema(saleLineSchema, { minItems: 1 }),
    totalPoints: integerSchema({ minimum: 0 }),
  },
  ["personId", "lines", "totalPoints"],
);

const procurementLineSchema = objectSchema(
  {
    itemId: stringSchema(),
    inventoryBatchId: stringSchema(),
    quantity: integerSchema({ minimum: 0 }),
    unitCost: numberSchema({ minimum: 0 }),
    lineTotalCost: numberSchema({ minimum: 0 }),
  },
  ["itemId", "inventoryBatchId", "quantity", "unitCost", "lineTotalCost"],
);

const procurementRecordedSchema = objectSchema(
  {
    supplierName: nullable(stringSchema()),
    tripDistanceKm: nullable(numberSchema({ minimum: 0 })),
    cashTotal: numberSchema({ minimum: 0 }),
    lines: arraySchema(procurementLineSchema, { minItems: 1 }),
  },
  ["cashTotal", "lines"],
);

const expenseRecordedSchema = objectSchema(
  {
    category: stringSchema(),
    cashAmount: numberSchema({ minimum: 0 }),
    notes: nullable(stringSchema()),
    receiptRef: nullable(stringSchema()),
  },
  ["category", "cashAmount"],
);

const inventoryStatusChangedSchema = objectSchema(
  {
    inventoryBatchId: stringSchema(),
    fromStatus: inventoryStatusSchema,
    toStatus: inventoryStatusSchema,
    quantity: integerSchema({ minimum: 0 }),
    reason: nullable(stringSchema()),
    notes: nullable(stringSchema()),
  },
  ["inventoryBatchId", "fromStatus", "toStatus", "quantity"],
);

const inventoryAdjustmentRequestedSchema = objectSchema(
  {
    inventoryBatchId: stringSchema(),
    requestedStatus: inventoryAdjustmentStatusSchema,
    quantity: integerSchema({ minimum: 0 }),
    reason: stringSchema(),
    notes: nullable(stringSchema()),
  },
  ["inventoryBatchId", "requestedStatus", "quantity", "reason"],
);

const inventoryAdjustmentAppliedSchema = objectSchema(
  {
    requestEventId: nullable(stringSchema()),
    inventoryBatchId: stringSchema(),
    fromStatus: inventoryStatusSchema,
    toStatus: inventoryStatusSchema,
    quantity: integerSchema({ minimum: 0 }),
    reason: stringSchema(),
    notes: nullable(stringSchema()),
  },
  ["inventoryBatchId", "fromStatus", "toStatus", "quantity", "reason"],
);

const pointsAdjustmentRequestedSchema = objectSchema(
  {
    personId: stringSchema(),
    deltaPoints: integerSchema(),
    reason: stringSchema(),
    notes: nullable(stringSchema()),
  },
  ["personId", "deltaPoints", "reason"],
);

const pointsAdjustmentAppliedSchema = objectSchema(
  {
    requestEventId: nullable(stringSchema()),
    personId: stringSchema(),
    deltaPoints: integerSchema(),
    reason: stringSchema(),
    notes: nullable(stringSchema()),
  },
  ["personId", "deltaPoints", "reason"],
);

const conflictDetectedSchema = objectSchema(
  {
    conflictId: stringSchema(),
    entityType: stringSchema({
      enum: ["person", "intake", "sale", "procurement", "expense", "inventory_batch", "points_ledger"],
    }),
    entityId: stringSchema(),
    detectedEventIds: arraySchema(stringSchema(), { minItems: 1 }),
    summary: nullable(stringSchema()),
  },
  ["conflictId", "entityType", "entityId", "detectedEventIds"],
);

const conflictResolvedSchema = objectSchema(
  {
    conflictId: stringSchema(),
    resolution: stringSchema({ enum: ["accepted", "rejected", "merged"] }),
    resolvedEventId: nullable(stringSchema()),
    relatedEventIds: nullable(arraySchema(stringSchema())),
    notes: nullable(stringSchema()),
  },
  ["conflictId", "resolution"],
);

export const eventPayloadSchemas: Record<EventType, JsonSchema> = {
  "person.created": personCreatedSchema,
  "person.profile_updated": personProfileUpdatedSchema,
  "material_type.created": materialTypeCreatedSchema,
  "material_type.updated": materialTypeUpdatedSchema,
  "item.created": itemCreatedSchema,
  "item.updated": itemUpdatedSchema,
  "staff_user.created": staffUserCreatedSchema,
  "staff_user.role_changed": staffUserRoleChangedSchema,
  "intake.recorded": intakeRecordedSchema,
  "sale.recorded": saleRecordedSchema,
  "procurement.recorded": procurementRecordedSchema,
  "expense.recorded": expenseRecordedSchema,
  "inventory.status_changed": inventoryStatusChangedSchema,
  "inventory.adjustment_requested": inventoryAdjustmentRequestedSchema,
  "inventory.adjustment_applied": inventoryAdjustmentAppliedSchema,
  "points.adjustment_requested": pointsAdjustmentRequestedSchema,
  "points.adjustment_applied": pointsAdjustmentAppliedSchema,
  "conflict.detected": conflictDetectedSchema,
  "conflict.resolved": conflictResolvedSchema,
};

const baseEventEnvelopeSchema = objectSchema(
  {
    eventId: stringSchema(),
    eventType: eventTypeSchema,
    occurredAt: stringSchema({ format: "date-time" }),
    recordedAt: nullable(stringSchema({ format: "date-time" })),
    actorUserId: stringSchema(),
    deviceId: stringSchema(),
    locationText: nullable(stringSchema()),
    schemaVersion: integerSchema({ enum: [1] }),
    correlationId: nullable(stringSchema()),
    causationId: nullable(stringSchema()),
    payload: objectSchema({}, []),
  },
  ["eventId", "eventType", "occurredAt", "actorUserId", "deviceId", "schemaVersion", "payload"],
);

const buildEventSchema = (eventType: EventType): JsonSchema => ({
  ...baseEventEnvelopeSchema,
  properties: {
    ...baseEventEnvelopeSchema.properties,
    eventType: { const: eventType },
    payload: eventPayloadSchemas[eventType],
  },
});

export const eventSchemas: Record<EventType, JsonSchema> = EVENT_TYPES.reduce(
  (acc, eventType) => {
    acc[eventType] = buildEventSchema(eventType);
    return acc;
  },
  {} as Record<EventType, JsonSchema>,
);

export const eventEnvelopeSchema: JsonSchema = {
  ...baseEventEnvelopeSchema,
  oneOf: EVENT_TYPES.map((eventType) => ({
    ...baseEventEnvelopeSchema,
    properties: {
      ...baseEventEnvelopeSchema.properties,
      eventType: { const: eventType },
      payload: eventPayloadSchemas[eventType],
    },
  })),
};
