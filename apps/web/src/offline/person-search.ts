/**
 * Person search matching rules shared across Collection/Sales (location-scoped,
 * with a strict broader fallback) and Administration (unscoped, global) contexts.
 * See docs/tmp/20260707-ui-changes-project-plan3.md, Phase 8.
 */

export const MIN_PERSON_SEARCH_QUERY_LENGTH = 3;

export type PersonSearchCandidate = {
  name: string;
  surname: string;
  assignedCollectionPointId?: string | null;
};

export const matchesPersonSearchQuery = (
  person: Pick<PersonSearchCandidate, "name" | "surname">,
  query: string,
): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  return (
    person.name.toLowerCase().includes(normalizedQuery) ||
    person.surname.toLowerCase().includes(normalizedQuery)
  );
};

/**
 * Collection/Sales local suggestions: only people assigned to the session's
 * locked collection point. Returns [] before the 3-letter threshold.
 */
export const filterLocalPersonSuggestions = <T extends PersonSearchCandidate>(
  people: T[],
  query: string,
  sessionCollectionPointId: string,
): T[] => {
  if (query.trim().length < MIN_PERSON_SEARCH_QUERY_LENGTH) {
    return [];
  }
  return people.filter(
    (person) =>
      person.assignedCollectionPointId === sessionCollectionPointId &&
      matchesPersonSearchQuery(person, query),
  );
};

/**
 * Administration global search, and the Collection/Sales broader fallback:
 * no location scoping. Returns [] before the 3-letter threshold.
 */
export const filterGlobalPersonSuggestions = <T extends PersonSearchCandidate>(
  people: T[],
  query: string,
): T[] => {
  if (query.trim().length < MIN_PERSON_SEARCH_QUERY_LENGTH) {
    return [];
  }
  return people.filter((person) => matchesPersonSearchQuery(person, query));
};

/**
 * The broader (cross-location) search in Collection/Sales is a strict fallback:
 * only offered once the threshold is met and local suggestions came back empty.
 */
export const shouldOfferBroaderPersonSearch = (
  localSuggestionCount: number,
  query: string,
): boolean => query.trim().length >= MIN_PERSON_SEARCH_QUERY_LENGTH && localSuggestionCount === 0;
