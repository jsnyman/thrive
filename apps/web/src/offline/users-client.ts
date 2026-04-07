import { createApiClient } from "./api-client";

export type StaffRole = "user" | "administrator";

export type StaffUserRecord = {
  id: string;
  username: string;
  role: StaffRole;
};

const isStaffUserRecord = (value: unknown): value is StaffUserRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    typeof record["username"] === "string" &&
    (record["role"] === "user" || record["role"] === "administrator")
  );
};

export const createUsersClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient(options);

  const listUsers = async (): Promise<StaffUserRecord[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/users",
    });
    if (!response.ok) {
      throw new Error(`Users fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "users");
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid users response");
    }
    const record = body as Record<string, unknown>;
    if (!Array.isArray(record["users"]) || !record["users"].every(isStaffUserRecord)) {
      throw new Error("Invalid users response");
    }
    return record["users"] as StaffUserRecord[];
  };

  const createUser = async (input: {
    username: string;
    role: StaffRole;
    passcode: string;
  }): Promise<StaffUserRecord> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/users",
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Create user failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "create user");
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid create user response");
    }
    const record = body as Record<string, unknown>;
    if (!isStaffUserRecord(record["user"])) {
      throw new Error("Invalid create user response");
    }
    return record["user"];
  };

  const updateUser = async (
    userId: string,
    input: {
      username?: string;
      role?: StaffRole;
      passcode?: string;
    },
  ): Promise<StaffUserRecord> => {
    const response = await apiClient.request({
      method: "PATCH",
      path: `/users/${userId}`,
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Update user failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "update user");
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid update user response");
    }
    const record = body as Record<string, unknown>;
    if (!isStaffUserRecord(record["user"])) {
      throw new Error("Invalid update user response");
    }
    return record["user"];
  };

  return {
    listUsers,
    createUser,
    updateUser,
  };
};
