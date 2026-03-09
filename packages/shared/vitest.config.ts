import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/shared/src/domain/validation.ts"],
      exclude: ["packages/shared/src/**/*.{test,spec}.{ts,tsx}"],
      thresholds: {
        statements: 20,
        branches: 12,
        functions: 25,
        lines: 20,
      },
    },
  },
});
