export const HEUWELKROON_PARKIE_NAME = "Heuwelkroon parkie";

/**
 * Historical intake/sale events predate the collection-point model and carry no
 * collectionPointId — they are backfilled to Heuwelkroon parkie for display in
 * projection-backed reads without mutating the original event payload. Events
 * that do carry a collectionPointId resolve to that collection point's real name.
 */
export const resolveHistoricalLocationName = (
  collectionPointId: string | null | undefined,
  collectionPointNameById: ReadonlyMap<string, string>,
): string => {
  if (collectionPointId !== null && collectionPointId !== undefined) {
    const resolvedName = collectionPointNameById.get(collectionPointId);
    if (resolvedName !== undefined) {
      return resolvedName;
    }
  }
  return HEUWELKROON_PARKIE_NAME;
};
