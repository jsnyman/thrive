import { HEUWELKROON_PARKIE_NAME, resolveHistoricalLocationName } from "./historical-location";

describe("resolveHistoricalLocationName", () => {
  test("falls back to Heuwelkroon parkie when collectionPointId is absent (old-shape event)", () => {
    const resolved = resolveHistoricalLocationName(undefined, new Map());
    expect(resolved).toBe(HEUWELKROON_PARKIE_NAME);
  });

  test("falls back to Heuwelkroon parkie when collectionPointId is null (old-shape event)", () => {
    const resolved = resolveHistoricalLocationName(null, new Map());
    expect(resolved).toBe(HEUWELKROON_PARKIE_NAME);
  });

  test("resolves to the real collection point name when collectionPointId matches (new-shape event)", () => {
    const collectionPointNameById = new Map([["cp-1", "Village B"]]);
    const resolved = resolveHistoricalLocationName("cp-1", collectionPointNameById);
    expect(resolved).toBe("Village B");
  });

  test("falls back to Heuwelkroon parkie when collectionPointId does not match any known collection point", () => {
    const collectionPointNameById = new Map([["cp-1", "Village B"]]);
    const resolved = resolveHistoricalLocationName("cp-unknown", collectionPointNameById);
    expect(resolved).toBe(HEUWELKROON_PARKIE_NAME);
  });
});
