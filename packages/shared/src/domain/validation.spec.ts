import { describe, expect, test } from "vitest";
import { validateEventPayload } from "./validation";

describe("validateEventPayload", () => {
  test("accepts valid intake payload with floor points", () => {
    const result = validateEventPayload("intake.recorded", {
      personId: "person-1",
      lines: [
        {
          materialTypeId: "mat-1",
          weightKg: 2.5,
          pointsPerKg: 3,
          pointsAwarded: 7,
        },
      ],
      totalPoints: 7,
    });

    expect(result.ok).toBe(true);
  });

  test("rejects intake payload when points are not floored", () => {
    const result = validateEventPayload("intake.recorded", {
      personId: "person-1",
      lines: [
        {
          materialTypeId: "mat-1",
          weightKg: 2.5,
          pointsPerKg: 3,
          pointsAwarded: 8,
        },
      ],
      totalPoints: 8,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path.includes("pointsAwarded"))).toBe(true);
  });
});
