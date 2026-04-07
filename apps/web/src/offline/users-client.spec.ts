import { describe, expect, test, vi } from "vitest";
import { createUsersClient } from "./users-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createUsersClient", () => {
  test("lists users", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        users: [
          {
            id: "user-1",
            username: "administrator",
            role: "administrator",
          },
        ],
      }),
    );
    const client = createUsersClient({ fetchFn, baseUrl: "/api" });

    const users = await client.listUsers();

    expect(users).toHaveLength(1);
    expect(users[0]?.username).toBe("administrator");
  });

  test("creates user", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          user: {
            id: "user-2",
            username: "ops",
            role: "user",
          },
        },
        201,
      ),
    );
    const client = createUsersClient({ fetchFn, baseUrl: "/api" });
    const user = await client.createUser({
      username: "ops",
      role: "user",
      passcode: "1234",
    });
    expect(user.id).toBe("user-2");
  });
});
