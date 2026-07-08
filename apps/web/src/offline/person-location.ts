/**
 * Assigned-location mismatch rule shared by Collection/Sales person selection.
 * See docs/tmp/20260707-ui-changes-project-plan3.md, Phase 9.
 */
export const personAssignedLocationMismatches = (
  assignedCollectionPointId: string | null | undefined,
  sessionCollectionPointId: string | null,
): boolean =>
  sessionCollectionPointId !== null &&
  (assignedCollectionPointId ?? null) !== sessionCollectionPointId;
