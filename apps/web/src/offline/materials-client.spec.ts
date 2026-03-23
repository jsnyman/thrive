import { describe, expect, test, vi } from "vitest";
import { createMaterialsClient } from "./materials-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createMaterialsClient", () => {
  test("lists materials", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        materials: [
          {
            id: "mat-1",
            name: "PET",
            pointsPerKg: 3,
          },
        ],
      }),
    );
    const client = createMaterialsClient({ fetchFn, baseUrl: "/api" });

    const materials = await client.listMaterials();

    expect(materials).toHaveLength(1);
    expect(materials[0]?.name).toBe("PET");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/materials");
  });

  test("throws deterministic errors for non-ok and invalid responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: "bad",
            },
          ],
        }),
      );
    const client = createMaterialsClient({ fetchFn });

    await expect(client.listMaterials()).rejects.toThrow("Materials fetch failed with status 500");
    await expect(client.listMaterials()).rejects.toThrow("Invalid material pointsPerKg");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/materials");
  });
});
