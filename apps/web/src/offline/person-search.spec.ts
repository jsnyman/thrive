import { describe, expect, test } from "vitest";
import {
  MIN_PERSON_SEARCH_QUERY_LENGTH,
  filterGlobalPersonSuggestions,
  filterLocalPersonSuggestions,
  matchesPersonSearchQuery,
  shouldOfferBroaderPersonSearch,
} from "./person-search";

const people = [
  { name: "Jane", surname: "Doe", assignedCollectionPointId: "cp-1" },
  { name: "Janet", surname: "Zulu", assignedCollectionPointId: "cp-2" },
  { name: "Alice", surname: "Janeway", assignedCollectionPointId: "cp-1" },
  { name: "Bob", surname: "Smith", assignedCollectionPointId: null },
];

describe("matchesPersonSearchQuery", () => {
  test("matches on name substring, case-insensitively", () => {
    expect(matchesPersonSearchQuery({ name: "Jane", surname: "Doe" }, "jan")).toBe(true);
  });

  test("matches on surname substring, case-insensitively", () => {
    expect(matchesPersonSearchQuery({ name: "Jane", surname: "Doe" }, "DO")).toBe(true);
  });

  test("does not match when neither name nor surname contains the query", () => {
    expect(matchesPersonSearchQuery({ name: "Jane", surname: "Doe" }, "xyz")).toBe(false);
  });

  test("treats an empty query as matching everything", () => {
    expect(matchesPersonSearchQuery({ name: "Jane", surname: "Doe" }, "")).toBe(true);
  });
});

describe("filterLocalPersonSuggestions", () => {
  test("returns no suggestions below the 3-letter threshold", () => {
    expect(filterLocalPersonSuggestions(people, "ja", "cp-1")).toEqual([]);
    expect(filterLocalPersonSuggestions(people, "", "cp-1")).toEqual([]);
  });

  test("returns only matches assigned to the session collection point", () => {
    const result = filterLocalPersonSuggestions(people, "jan", "cp-1");
    expect(result).toEqual([
      { name: "Jane", surname: "Doe", assignedCollectionPointId: "cp-1" },
      { name: "Alice", surname: "Janeway", assignedCollectionPointId: "cp-1" },
    ]);
  });

  test("excludes matches assigned to a different collection point", () => {
    const result = filterLocalPersonSuggestions(people, "jan", "cp-2");
    expect(result).toEqual([{ name: "Janet", surname: "Zulu", assignedCollectionPointId: "cp-2" }]);
  });

  test("excludes people with no assigned collection point", () => {
    const result = filterLocalPersonSuggestions(people, "bob", "cp-1");
    expect(result).toEqual([]);
  });

  test("exactly at the threshold returns results", () => {
    expect(filterLocalPersonSuggestions(people, "Jan", "cp-1").length).toBe(2);
    expect(MIN_PERSON_SEARCH_QUERY_LENGTH).toBe(3);
  });
});

describe("filterGlobalPersonSuggestions", () => {
  test("returns no suggestions below the 3-letter threshold", () => {
    expect(filterGlobalPersonSuggestions(people, "ja")).toEqual([]);
  });

  test("matches across all collection points once the threshold is met", () => {
    const result = filterGlobalPersonSuggestions(people, "jan");
    expect(result).toEqual([
      { name: "Jane", surname: "Doe", assignedCollectionPointId: "cp-1" },
      { name: "Janet", surname: "Zulu", assignedCollectionPointId: "cp-2" },
      { name: "Alice", surname: "Janeway", assignedCollectionPointId: "cp-1" },
    ]);
  });

  test("includes people with no assigned collection point", () => {
    const result = filterGlobalPersonSuggestions(people, "bob");
    expect(result).toEqual([{ name: "Bob", surname: "Smith", assignedCollectionPointId: null }]);
  });
});

describe("shouldOfferBroaderPersonSearch", () => {
  test("is false below the 3-letter threshold, even with zero local results", () => {
    expect(shouldOfferBroaderPersonSearch(0, "ja")).toBe(false);
  });

  test("is false once local suggestions exist", () => {
    expect(shouldOfferBroaderPersonSearch(2, "jan")).toBe(false);
  });

  test("is true only when the threshold is met and local suggestions are empty", () => {
    expect(shouldOfferBroaderPersonSearch(0, "jan")).toBe(true);
  });
});
