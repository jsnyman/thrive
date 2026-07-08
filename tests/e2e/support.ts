export const readStringField = (value: unknown, field: string): string => {
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

export const readNestedStringField = (
  value: unknown,
  parentField: string,
  childField: string,
): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object JSON response");
  }
  const record = value as Record<string, unknown>;
  return readStringField(record[parentField], childField);
};

export const readNestedNumberField = (
  value: unknown,
  parentField: string,
  childField: string,
): number => {
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

export const readNestedBooleanField = (
  value: unknown,
  parentField: string,
  childField: string,
): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object JSON response");
  }
  const record = value as Record<string, unknown>;
  const parentValue = record[parentField];
  if (typeof parentValue !== "object" || parentValue === null || Array.isArray(parentValue)) {
    throw new Error(`Expected object field: ${parentField}`);
  }
  const childValue = (parentValue as Record<string, unknown>)[childField];
  if (typeof childValue !== "boolean") {
    throw new Error(`Expected boolean field: ${parentField}.${childField}`);
  }
  return childValue;
};

export const loginAndGetToken = async (
  request: import("@playwright/test").APIRequestContext,
  apiBaseUrl: string,
  username = "administrator",
  passcode = "1234",
): Promise<string> => {
  const login = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { username, passcode },
  });
  if (!login.ok()) {
    throw new Error(`Login failed with status ${String(login.status())}`);
  }
  const loginBody: unknown = await login.json();
  return readStringField(loginBody, "token");
};
