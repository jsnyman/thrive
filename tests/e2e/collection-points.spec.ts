import { expect, test } from "@playwright/test";
import {
  loginAndGetToken,
  readNestedBooleanField,
  readNestedNumberField,
  readNestedStringField,
} from "./support";

const apiBaseUrl = process.env.E2E_API_BASE_URL;

test.skip(apiBaseUrl === undefined, "Set E2E_API_BASE_URL to run API-backed e2e tests.");

test("collection point CRUD, inactive behavior, and a location-tagged collection", async ({
  request,
}) => {
  const token = await loginAndGetToken(request, apiBaseUrl ?? "");
  const authHeaders = { authorization: `Bearer ${token}` };

  const createResponse = await request.post(`${apiBaseUrl}/collection-points`, {
    headers: authHeaders,
    data: { name: `E2E Point ${String(Date.now())}` },
  });
  expect(createResponse.ok()).toBe(true);
  const createBody: unknown = await createResponse.json();
  const collectionPointId = readNestedStringField(createBody, "collectionPoint", "id");
  expect(readNestedBooleanField(createBody, "collectionPoint", "isActive")).toBe(true);

  const listResponse = await request.get(`${apiBaseUrl}/collection-points`, {
    headers: authHeaders,
  });
  expect(listResponse.ok()).toBe(true);
  const listBody: unknown = await listResponse.json();
  const listRecord = listBody as { collectionPoints: Array<{ id: string }> };
  expect(listRecord.collectionPoints.some((point) => point.id === collectionPointId)).toBe(true);

  const personResponse = await request.post(`${apiBaseUrl}/people`, {
    headers: authHeaders,
    data: { name: "E2E", surname: "CollectionPointPerson" },
  });
  expect(personResponse.ok()).toBe(true);
  const personId = readNestedStringField(await personResponse.json(), "person", "id");

  const materialResponse = await request.post(`${apiBaseUrl}/materials`, {
    headers: authHeaders,
    data: { name: `PET-E2E-CP-${String(Date.now())}`, pointsPerKg: 2 },
  });
  expect(materialResponse.ok()).toBe(true);
  const materialId = readNestedStringField(await materialResponse.json(), "material", "id");

  const intakeResponse = await request.post(`${apiBaseUrl}/intakes`, {
    headers: authHeaders,
    data: {
      personId,
      collectionPointId,
      lines: [{ materialTypeId: materialId, weightKg: 1 }],
    },
  });
  expect(intakeResponse.ok()).toBe(true);

  // Deactivating a collection point must not clear existing person assignments.
  const deactivateResponse = await request.patch(
    `${apiBaseUrl}/collection-points/${collectionPointId}`,
    {
      headers: authHeaders,
      data: { updates: { isActive: false } },
    },
  );
  expect(deactivateResponse.ok()).toBe(true);
  expect(
    readNestedBooleanField(await deactivateResponse.json(), "collectionPoint", "isActive"),
  ).toBe(false);

  const balanceResponse = await request.get(`${apiBaseUrl}/ledger/${personId}/balance`, {
    headers: authHeaders,
  });
  expect(balanceResponse.ok()).toBe(true);
  expect(readNestedNumberField(await balanceResponse.json(), "balance", "balancePoints")).toBe(2);
});
