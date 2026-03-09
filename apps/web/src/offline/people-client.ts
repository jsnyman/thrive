import { createApiClient } from "./api-client";

export type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseNullableString = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
};

const parsePerson = (value: unknown): PersonRecord => {
  if (!isRecord(value)) {
    throw new Error("Invalid person");
  }
  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    typeof value["surname"] !== "string"
  ) {
    throw new Error("Invalid person");
  }
  return {
    id: value["id"],
    name: value["name"],
    surname: value["surname"],
    idNumber: parseNullableString(value["idNumber"], "person.idNumber"),
    phone: parseNullableString(value["phone"], "person.phone"),
    address: parseNullableString(value["address"], "person.address"),
    notes: parseNullableString(value["notes"], "person.notes"),
  };
};

export const createPeopleClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listPeople = async (searchText?: string): Promise<PersonRecord[]> => {
    const query =
      searchText === undefined || searchText.trim().length === 0
        ? ""
        : `?search=${encodeURIComponent(searchText)}`;
    const response = await apiClient.request({
      method: "GET",
      path: `/people${query}`,
    });
    if (!response.ok) {
      throw new Error(`People fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "people list");
    if (!isRecord(body) || !Array.isArray(body["people"])) {
      throw new Error("Invalid people response");
    }
    return body["people"].map(parsePerson);
  };

  return {
    listPeople,
  };
};
