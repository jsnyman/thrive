import { describe, expect, test } from "vitest";
import { personAssignedLocationMismatches } from "./person-location";

describe("personAssignedLocationMismatches", () => {
  test("is false when there is no active session collection point", () => {
    expect(personAssignedLocationMismatches("cp-1", null)).toBe(false);
    expect(personAssignedLocationMismatches(null, null)).toBe(false);
  });

  test("is false when the person's assigned location matches the session point", () => {
    expect(personAssignedLocationMismatches("cp-1", "cp-1")).toBe(false);
  });

  test("is true when the person's assigned location differs from the session point", () => {
    expect(personAssignedLocationMismatches("cp-1", "cp-2")).toBe(true);
  });

  test("is true when the person has no assigned location at all", () => {
    expect(personAssignedLocationMismatches(null, "cp-2")).toBe(true);
    expect(personAssignedLocationMismatches(undefined, "cp-2")).toBe(true);
  });
});
