import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_BASE_URL;

test.skip(apiBaseUrl === undefined, "Set E2E_API_BASE_URL to run API-backed e2e tests.");

const readStringField = (value: unknown, field: string): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object JSON response");
  }
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  if (typeof fieldValue !== "string") {
    throw new Error(`Expected string field: ${field}`);
  }
  return fieldValue;
};

const readNestedStringField = (value: unknown, parentField: string, childField: string): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object JSON response");
  }
  const record = value as Record<string, unknown>;
  return readStringField(record[parentField], childField);
};

const readNestedNumberField = (value: unknown, parentField: string, childField: string): number => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object JSON response");
  }
  const record = value as Record<string, unknown>;
  const parentValue = record[parentField];
  if (typeof parentValue !== "object" || parentValue === null || Array.isArray(parentValue)) {
    throw new Error(`Expected object field: ${parentField}`);
  }
  const childValue = (parentValue as Record<string, unknown>)[childField];
  if (typeof childValue !== "number") {
    throw new Error(`Expected number field: ${parentField}.${childField}`);
  }
  return childValue;
};

test("login -> person create -> intake -> balance", async ({ request }) => {
  const login = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      username: "administrator",
      passcode: "1234",
    },
  });
  expect(login.ok()).toBe(true);
  const loginBody: unknown = await login.json();
  const token = readStringField(loginBody, "token");

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
