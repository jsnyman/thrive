import { afterEach, describe, expect, test, vi } from "vitest";
import { createMaterialsClient } from "./materials-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const originalOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, "onLine");

afterEach(() => {
  if (originalOnLine !== undefined) {
    Object.defineProperty(globalThis.navigator, "onLine", originalOnLine);
  }
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
            imageUpdatedAt: "2026-07-08T10:00:00.000Z",
          },
        ],
      }),
    );
    const client = createMaterialsClient({ fetchFn, baseUrl: "/api" });

    const materials = await client.listMaterials();

    expect(materials).toHaveLength(1);
    expect(materials[0]?.name).toBe("PET");
    expect(materials[0]?.imageUpdatedAt).toBe("2026-07-08T10:00:00.000Z");
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

  test("creates a material", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ material: { id: "mat-2", name: "Glass", pointsPerKg: 2.1 } }, 201),
      );
    const client = createMaterialsClient({ fetchFn, baseUrl: "/api" });

    const created = await client.createMaterial({ name: "Glass", pointsPerKg: 2.1 });

    expect(created).toEqual({ id: "mat-2", name: "Glass", pointsPerKg: 2.1, imageUpdatedAt: null });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/materials");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      name: "Glass",
      pointsPerKg: 2.1,
    });
  });

  test("throws a deterministic error when creating a material fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, 400));
    const client = createMaterialsClient({ fetchFn });

    await expect(client.createMaterial({ name: "", pointsPerKg: 1 })).rejects.toThrow(
      "Material create failed with status 400",
    );
  });

  test("uploads a material image when online", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          materialTypeId: "mat-1",
          contentType: "image/png",
          fileName: "pet.png",
          fileSizeBytes: 4,
          updatedAt: "2026-07-08T10:00:00.000Z",
        },
        201,
      ),
    );
    const client = createMaterialsClient({ fetchFn, baseUrl: "/api" });

    const uploaded = await client.uploadMaterialImage("mat-1", {
      contentType: "image/png",
      fileName: "pet.png",
      dataBase64: "AQIDBA==",
    });

    expect(uploaded.updatedAt).toBe("2026-07-08T10:00:00.000Z");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/materials/mat-1/image");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
  });

  test("blocks material image upload while offline", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const fetchFn = vi.fn<typeof fetch>();
    const client = createMaterialsClient({ fetchFn });

    await expect(
      client.uploadMaterialImage("mat-1", {
        contentType: "image/png",
        fileName: "pet.png",
        dataBase64: "AQIDBA==",
      }),
    ).rejects.toThrow("Material image upload requires an online connection");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("reads a material image blob", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("test-image", {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    );
    const client = createMaterialsClient({ fetchFn, baseUrl: "/api" });

    const image = await client.readMaterialImage("mat-1");

    expect(image.contentType).toBe("image/png");
    await expect(image.blob.text()).resolves.toBe("test-image");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/materials/mat-1/image");
  });
});
