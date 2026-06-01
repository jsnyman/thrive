import { describe, expect, test } from "vitest";
import { isRecoverableSqliteError } from "./sqlite-recovery";

describe("isRecoverableSqliteError", () => {
  test("matches malformed database errors", () => {
    expect(isRecoverableSqliteError(new Error("database disk image is malformed"))).toBe(true);
  });

  test("matches wasm bounds errors", () => {
    expect(isRecoverableSqliteError(new Error("RuntimeError: index out of bounds"))).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isRecoverableSqliteError(new Error("Unauthorized"))).toBe(false);
  });
});
