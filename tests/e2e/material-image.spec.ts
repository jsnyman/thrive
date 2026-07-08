import { expect, test } from "@playwright/test";
import { loginAndGetToken, readNestedStringField } from "./support";

const apiBaseUrl = process.env.E2E_API_BASE_URL;

test.skip(apiBaseUrl === undefined, "Set E2E_API_BASE_URL to run API-backed e2e tests.");

test("material image placeholder behavior, then upload and read-back", async ({ request }) => {
  const token = await loginAndGetToken(request, apiBaseUrl ?? "");
  const authHeaders = { authorization: `Bearer ${token}` };

  const materialResponse = await request.post(`${apiBaseUrl}/materials`, {
    headers: authHeaders,
    data: { name: `PET-E2E-IMAGE-${String(Date.now())}`, pointsPerKg: 3 },
  });
  expect(materialResponse.ok()).toBe(true);
  const materialId = readNestedStringField(await materialResponse.json(), "material", "id");

  // Missing image: the API returns 404, which the web client treats as "no image
  // uploaded" and renders a placeholder for.
  const missingImageResponse = await request.get(`${apiBaseUrl}/materials/${materialId}/image`, {
    headers: authHeaders,
  });
  expect(missingImageResponse.status()).toBe(404);

  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
  ]);
  const uploadResponse = await request.put(`${apiBaseUrl}/materials/${materialId}/image`, {
    headers: authHeaders,
    data: {
      contentType: "image/png",
      fileName: "e2e.png",
      dataBase64: pngBytes.toString("base64"),
    },
  });
  expect(uploadResponse.ok()).toBe(true);

  const readResponse = await request.get(`${apiBaseUrl}/materials/${materialId}/image`, {
    headers: authHeaders,
  });
  expect(readResponse.ok()).toBe(true);
  expect(readResponse.headers()["content-type"]).toContain("image/png");
  const readBytes = await readResponse.body();
  expect(Buffer.compare(readBytes, pngBytes)).toBe(0);

  const listResponse = await request.get(`${apiBaseUrl}/materials`, { headers: authHeaders });
  expect(listResponse.ok()).toBe(true);
  const listBody = (await listResponse.json()) as {
    materials: Array<{ id: string; imageUpdatedAt: string | null }>;
  };
  const listedMaterial = listBody.materials.find((material) => material.id === materialId);
  expect(listedMaterial?.imageUpdatedAt).toBeTruthy();
});
