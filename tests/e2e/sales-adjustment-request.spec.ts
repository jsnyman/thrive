import { expect, test } from "@playwright/test";
import { loginAndGetToken, readNestedStringField, readStringField } from "./support";

const apiBaseUrl = process.env.E2E_API_BASE_URL;

test.skip(apiBaseUrl === undefined, "Set E2E_API_BASE_URL to run API-backed e2e tests.");

test("sale recorded -> adjustment request linked to it -> retry after a bad reference fails", async ({
  request,
}) => {
  const token = await loginAndGetToken(request, apiBaseUrl ?? "");
  const authHeaders = { authorization: `Bearer ${token}` };

  const personResponse = await request.post(`${apiBaseUrl}/people`, {
    headers: authHeaders,
    data: { name: "E2E", surname: "SalePerson" },
  });
  expect(personResponse.ok()).toBe(true);
  const personId = readNestedStringField(await personResponse.json(), "person", "id");

  const materialResponse = await request.post(`${apiBaseUrl}/materials`, {
    headers: authHeaders,
    data: { name: `PET-E2E-SALE-${String(Date.now())}`, pointsPerKg: 10 },
  });
  expect(materialResponse.ok()).toBe(true);
  const materialId = readNestedStringField(await materialResponse.json(), "material", "id");

  const intakeResponse = await request.post(`${apiBaseUrl}/intakes`, {
    headers: authHeaders,
    data: { personId, lines: [{ materialTypeId: materialId, weightKg: 5 }] },
  });
  expect(intakeResponse.ok()).toBe(true);

  const itemResponse = await request.post(`${apiBaseUrl}/items`, {
    headers: authHeaders,
    data: { name: `Soap-E2E-${String(Date.now())}`, pointsPrice: 5 },
  });
  expect(itemResponse.ok()).toBe(true);
  const itemId = readNestedStringField(await itemResponse.json(), "item", "id");

  const procurementResponse = await request.post(`${apiBaseUrl}/procurements`, {
    headers: authHeaders,
    data: {
      occurredAt: new Date().toISOString(),
      lines: [{ itemId, unitCost: 2, quantity: 5, markupPercent: 0 }],
    },
  });
  expect(procurementResponse.ok()).toBe(true);
  const procurementBody = (await procurementResponse.json()) as {
    lines: Array<{ inventoryBatchId: string }>;
  };
  const inventoryBatchId = readStringField(procurementBody.lines[0], "inventoryBatchId");

  const statusChangeResponse = await request.post(`${apiBaseUrl}/inventory/status-changes`, {
    headers: authHeaders,
    data: {
      inventoryBatchId,
      fromStatus: "storage",
      toStatus: "shop",
      quantity: 5,
      reason: "e2e stock for sale",
    },
  });
  expect(statusChangeResponse.ok()).toBe(true);

  const saleResponse = await request.post(`${apiBaseUrl}/sales`, {
    headers: authHeaders,
    data: { personId, lines: [{ itemId, quantity: 1 }] },
  });
  expect(saleResponse.ok()).toBe(true);

  const pullResponse = await request.get(`${apiBaseUrl}/sync/pull?cursor=0&limit=200`, {
    headers: authHeaders,
  });
  expect(pullResponse.ok()).toBe(true);
  const pullBody = (await pullResponse.json()) as {
    events: Array<{ eventType: string; eventId: string; payload: { personId?: string } }>;
  };
  const saleEvent = pullBody.events.find(
    (event) => event.eventType === "sale.recorded" && event.payload.personId === personId,
  );
  expect(saleEvent).toBeDefined();

  const adjustmentResponse = await request.post(`${apiBaseUrl}/sales/adjustment-requests`, {
    headers: authHeaders,
    data: {
      saleEventId: saleEvent?.eventId,
      personId,
      note: "E2E: item was damaged, please review",
    },
  });
  expect(adjustmentResponse.ok()).toBe(true);
  expect(readStringField(await adjustmentResponse.json(), "requestEventId")).toBeTruthy();

  // A retry against a nonexistent sale must fail deterministically, matching the web
  // client's "sale stands, adjustment request retried separately" recovery path.
  const failedRetryResponse = await request.post(`${apiBaseUrl}/sales/adjustment-requests`, {
    headers: authHeaders,
    data: {
      saleEventId: "00000000-0000-0000-0000-000000000000",
      personId,
      note: "E2E retry against a bad reference",
    },
  });
  expect(failedRetryResponse.ok()).toBe(false);
  expect(failedRetryResponse.status()).toBe(404);
});
