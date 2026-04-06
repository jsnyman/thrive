import { afterEach, describe, expect, test, vi } from "vitest";
import { clearAuthToken, getAuthToken, setAuthToken } from "./api-client";
import { createAuthClient } from "./auth-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createAuthClient", () => {
  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  test("login stores token and returns user", async () => {
    clearAuthToken();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-1",
          username: "administrator",
          role: "administrator",
        },
        token: "token-1",
      }),
    );
    const client = createAuthClient({ fetchFn });

    const user = await client.login("administrator", "1234");
    expect(user.username).toBe("administrator");
    expect(getAuthToken()).toBe("token-1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/auth/login");
  });

  test("loadSession returns null and clears token on unauthorized", async () => {
    clearAuthToken();
    const loginFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-1",
          username: "user",
          role: "user",
        },
        token: "token-2",
      }),
    );
    const loginClient = createAuthClient({ fetchFn: loginFetch });
    await loginClient.login("user", "1234");
    expect(getAuthToken()).toBe("token-2");

    const meFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "UNAUTHORIZED" }, 401));
    const meClient = createAuthClient({ fetchFn: meFetch });
    const user = await meClient.loadSession();

    expect(user).toBeNull();
    expect(getAuthToken()).toBeNull();
    expect(meFetch.mock.calls[0]?.[0]).toBe("/api/auth/me");
  });

  test("throws deterministic validation errors for invalid payloads", async () => {
    const invalidRoleFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-1",
          username: "bad-role",
          role: "invalid",
        },
        token: "token-3",
      }),
    );
    const invalidRoleClient = createAuthClient({ fetchFn: invalidRoleFetch });
    await expect(invalidRoleClient.login("bad-role", "1234")).rejects.toThrow(
      "Invalid auth user role",
    );

    const invalidMeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ user: "not-an-object" }));
    const invalidMeClient = createAuthClient({ fetchFn: invalidMeFetch });
    setAuthToken("token-for-me");
    await expect(invalidMeClient.loadSession()).rejects.toThrow("Invalid auth user");
    clearAuthToken();
  });
});
