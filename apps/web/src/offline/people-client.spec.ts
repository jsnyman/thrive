import { describe, expect, test, vi } from "vitest";
import { createPeopleClient } from "./people-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createPeopleClient", () => {
  test("lists people and applies search query", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        people: [
          {
            id: "person-1",
            name: "Jane",
            surname: "Doe",
            idNumber: null,
            phone: "0821234567",
            address: null,
            notes: null,
          },
        ],
      }),
    );
    const client = createPeopleClient({ fetchFn, baseUrl: "/api" });

    const people = await client.listPeople("Jane Doe");

    expect(people).toHaveLength(1);
    expect(people[0]?.name).toBe("Jane");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/people?search=Jane%20Doe");
  });

  test("throws deterministic errors for non-ok and invalid responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
              idNumber: 123,
            },
          ],
        }),
      );
    const client = createPeopleClient({ fetchFn });

    await expect(client.listPeople()).rejects.toThrow("People fetch failed with status 500");
    await expect(client.listPeople()).rejects.toThrow("Invalid person.idNumber");
  });
});
