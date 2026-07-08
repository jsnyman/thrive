import { expect, test } from "@playwright/test";
import { loginAndGetToken, readNestedNumberField, readNestedStringField } from "./support";

const apiBaseUrl = process.env.E2E_API_BASE_URL;

test.skip(apiBaseUrl === undefined, "Set E2E_API_BASE_URL to run API-backed e2e tests.");

test("login -> person create -> intake -> balance", async ({ request }) => {
  const token = await loginAndGetToken(request, apiBaseUrl ?? "");

  const personResponse = await request.post(`${apiBaseUrl}/people`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    data: {
      name: "E2E",
      surname: "Person",
    },
  });
  expect(personResponse.ok()).toBe(true);
  const personBody: unknown = await personResponse.json();
  const personId = readNestedStringField(personBody, "person", "id");

  const materialResponse = await request.post(`${apiBaseUrl}/materials`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    data: {
      name: `PET-E2E-${Date.now()}`,
      pointsPerKg: 2,
    },
  });
  expect(materialResponse.ok()).toBe(true);
  const materialBody: unknown = await materialResponse.json();
  const materialId = readNestedStringField(materialBody, "material", "id");

  const intakeResponse = await request.post(`${apiBaseUrl}/intakes`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    data: {
      personId,
      lines: [
        {
          materialTypeId: materialId,
          weightKg: 3.2,
        },
      ],
    },
  });
  expect(intakeResponse.ok()).toBe(true);

  const balanceResponse = await request.get(`${apiBaseUrl}/ledger/${personId}/balance`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  expect(balanceResponse.ok()).toBe(true);
  const balanceBody: unknown = await balanceResponse.json();
  const balancePoints = readNestedNumberField(balanceBody, "balance", "balancePoints");
  expect(balancePoints).toBe(6);
});
