import { afterEach, describe, expect, test, vi } from "vitest";
import { clearAuthToken, createApiClient, getAuthToken, setAuthToken } from "./api-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("api-client", () => {
  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  test("reads and applies auth token to request headers", async () => {
    setAuthToken("token-1");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = createApiClient({ fetchFn, baseUrl: "/api" });

    await client.request({
      method: "POST",
      path: "/sync/push",
      body: { hello: "world" },
    });

    const call = fetchFn.mock.calls[0];
    expect(call?.[0]).toBe("/api/sync/push");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer token-1",
        "content-type": "application/json",
      },
    });
    clearAuthToken();
  });

  test("returns null when token is missing/blank and clears token", () => {
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    setAuthToken("   ");
    expect(getAuthToken()).toBeNull();
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  test("throws deterministic error on invalid json parsing", async () => {
    const client = createApiClient();
    const invalidJsonResponse = new Response("not-json", {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });

    await expect(client.readJson(invalidJsonResponse, "unit test context")).rejects.toThrow(
      "Invalid JSON from unit test context",
    );
  });

  test("uses /api as the default baseUrl", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = createApiClient({ fetchFn });

    await client.request({
      method: "GET",
      path: "/people",
    });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/people");
  });
});
