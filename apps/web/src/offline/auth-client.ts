import { clearAuthToken, createApiClient, getAuthToken, setAuthToken } from "./api-client";

export type AuthUser = {
  id: string;
  username: string;
  role: "collector" | "shop_operator" | "manager";
};

type LoginResponse = {
  user: AuthUser;
  token: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseAuthUser = (value: unknown): AuthUser => {
  if (!isRecord(value)) {
    throw new Error("Invalid auth user");
  }
  const id = value["id"];
  const username = value["username"];
  const role = value["role"];
  if (typeof id !== "string" || typeof username !== "string") {
    throw new Error("Invalid auth user");
  }
  if (role !== "collector" && role !== "shop_operator" && role !== "manager") {
    throw new Error("Invalid auth user role");
  }
  return {
    id,
    username,
    role,
  };
};

const parseLoginResponse = (value: unknown): LoginResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid login response");
  }
  if (typeof value["token"] !== "string") {
    throw new Error("Invalid login token");
  }
  return {
    user: parseAuthUser(value["user"]),
    token: value["token"],
  };
};

export const createAuthClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const login = async (username: string, passcode: string): Promise<AuthUser> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/auth/login",
      withAuth: false,
      body: {
        username,
        passcode,
      },
    });
    if (!response.ok) {
      throw new Error(`Login failed with status ${String(response.status)}`);
    }
    const parsed = parseLoginResponse(await apiClient.readJson<unknown>(response, "auth login"));
    setAuthToken(parsed.token);
    return parsed.user;
  };

  const loadSession = async (): Promise<AuthUser | null> => {
    if (getAuthToken() === null) {
      return null;
    }
    const response = await apiClient.request({
      method: "GET",
      path: "/auth/me",
    });
    if (response.status === 401 || response.status === 403) {
      clearAuthToken();
      return null;
    }
    if (!response.ok) {
      throw new Error(`Session check failed with status ${String(response.status)}`);
    }
    const value = await apiClient.readJson<unknown>(response, "auth me");
    if (!isRecord(value)) {
      throw new Error("Invalid auth me response");
    }
    return parseAuthUser(value["user"]);
  };

  const logout = (): void => {
    clearAuthToken();
  };

  return {
    login,
    loadSession,
    logout,
  };
};
