import { readApiRuntimeConfig } from "./config";

describe("readApiRuntimeConfig", () => {
  test("uses defaults for error log path and max bytes", () => {
    const config = readApiRuntimeConfig({
      AUTH_SECRET: "secret",
    });

    expect(config.errorLogPath).toBe("/var/log/swapshop-api/app-error.log");
    expect(config.errorLogMaxBytes).toBe(5 * 1024 * 1024);
  });

  test("accepts error log env overrides", () => {
    const config = readApiRuntimeConfig({
      AUTH_SECRET: "secret",
      API_ERROR_LOG_PATH: "/tmp/custom-api.log",
      API_ERROR_LOG_MAX_BYTES: "1048576",
    });

    expect(config.errorLogPath).toBe("/tmp/custom-api.log");
    expect(config.errorLogMaxBytes).toBe(1048576);
  });

  test("rejects invalid API_ERROR_LOG_MAX_BYTES", () => {
    expect(() =>
      readApiRuntimeConfig({
        AUTH_SECRET: "secret",
        API_ERROR_LOG_MAX_BYTES: "0",
      }),
    ).toThrow("API_ERROR_LOG_MAX_BYTES must be a positive integer");
  });
});
