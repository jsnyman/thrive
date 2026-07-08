import { describe, expect, test, vi } from "vitest";
import { createCollectionPointsClient } from "./collection-points-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createCollectionPointsClient", () => {
  test("lists collection points", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        collectionPoints: [
          {
            id: "cp-1",
            name: "Heuwelkroon parkie",
            isActive: true,
          },
        ],
      }),
    );
    const client = createCollectionPointsClient({ fetchFn, baseUrl: "/api" });

    const collectionPoints = await client.listCollectionPoints();

    expect(collectionPoints).toHaveLength(1);
    expect(collectionPoints[0]?.name).toBe("Heuwelkroon parkie");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/collection-points");
  });

  test("throws deterministic errors for non-ok and invalid responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          collectionPoints: [
            {
              id: "cp-1",
              name: "Heuwelkroon parkie",
              isActive: "yes",
            },
          ],
        }),
      );
    const client = createCollectionPointsClient({ fetchFn });

    await expect(client.listCollectionPoints()).rejects.toThrow(
      "Collection points fetch failed with status 500",
    );
    await expect(client.listCollectionPoints()).rejects.toThrow(
      "Invalid collection point isActive",
    );
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/collection-points");
  });

  test("creates a collection point", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          { collectionPoint: { id: "cp-2", name: "Old Village Point", isActive: true } },
          201,
        ),
      );
    const client = createCollectionPointsClient({ fetchFn, baseUrl: "/api" });

    const created = await client.createCollectionPoint({ name: "Old Village Point" });

    expect(created).toEqual({ id: "cp-2", name: "Old Village Point", isActive: true });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/collection-points");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      name: "Old Village Point",
    });
  });

  test("throws a deterministic error when creating a collection point fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, 400));
    const client = createCollectionPointsClient({ fetchFn });

    await expect(client.createCollectionPoint({ name: "" })).rejects.toThrow(
      "Collection point create failed with status 400",
    );
  });

  test("updates a collection point", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ collectionPoint: { id: "cp-1", name: "Renamed", isActive: false } }),
      );
    const client = createCollectionPointsClient({ fetchFn, baseUrl: "/api" });

    const updated = await client.updateCollectionPoint("cp-1", {
      updates: { name: "Renamed", isActive: false },
    });

    expect(updated).toEqual({ id: "cp-1", name: "Renamed", isActive: false });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/collection-points/cp-1");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      updates: { name: "Renamed", isActive: false },
    });
  });

  test("throws a deterministic error when updating a collection point fails", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "COLLECTION_POINT_NOT_FOUND" }, 404));
    const client = createCollectionPointsClient({ fetchFn });

    await expect(
      client.updateCollectionPoint("cp-1", { updates: { isActive: false } }),
    ).rejects.toThrow("Collection point update failed with status 404");
  });
});
