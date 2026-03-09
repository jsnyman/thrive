import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./apps/web/src/test/setup.ts",
    include: ["apps/web/src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["apps/web/src/**/*.{ts,tsx}"],
      exclude: [
        "apps/web/src/**/*.{test,spec}.{ts,tsx}",
        "apps/web/src/test/**",
        "apps/web/src/**/*.d.ts",
        "apps/web/src/**/*.css",
        "apps/web/src/main.tsx",
        "apps/web/src/offline/event-queue-sqlite.worker.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 75,
        lines: 75,
      },
    },
  },
});
