import { describe, expect, test } from "vitest";
import {
  comparePointValues,
  floorPointsToTenths,
  formatPointValue,
  isTenthsPointValue,
  multiplyPointValue,
  normalizePointValue,
  sumPointValues,
  toPointTenths,
} from "./points";

describe("point helpers", () => {
  test("floors values to tenths", () => {
    expect(floorPointsToTenths(5.39)).toBe(5.3);
  });

  test("normalizes floating point tenths values", () => {
    expect(normalizePointValue(30.299999999999997)).toBe(30.3);
  });

  test("detects valid tenths values", () => {
    expect(isTenthsPointValue(5.3)).toBe(true);
    expect(isTenthsPointValue(5.37)).toBe(false);
  });

  test("sums and multiplies using tenths precision", () => {
    expect(sumPointValues([9.2, 3.2])).toBe(12.4);
    expect(multiplyPointValue(10.5, 3)).toBe(31.5);
  });

  test("compares using tenths precision", () => {
    expect(comparePointValues(30.3, 30.299999999999997)).toBe(0);
    expect(toPointTenths(30.3)).toBe(303);
  });

  test("formats a point value with one decimal place", () => {
    expect(formatPointValue(20)).toBe("20.0");
  });
});
