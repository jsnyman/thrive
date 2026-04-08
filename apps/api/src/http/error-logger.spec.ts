import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import {
  createApiErrorLogger,
  registerProcessFatalErrorHandlers,
  type ApiErrorLogger,
} from "./error-logger";

const createTempDir = (): string => mkdtempSync(join(tmpdir(), "swapshop-api-logger-"));

describe("api error logger", () => {
  test("writes request errors with timestamp, method, path, and stack trace", () => {
    const dir = createTempDir();
    const logPath = join(dir, "app-error.log");
    const logger = createApiErrorLogger({
      filePath: logPath,
      maxBytes: 5 * 1024 * 1024,
      now: () => new Date("2026-04-08T10:00:00.000Z"),
    });

    logger.logRequestError({ method: "GET", path: "/people" }, new Error("boom-request"));

    const content = readFileSync(logPath, "utf8");
    expect(content).toContain("[2026-04-08T10:00:00.000Z] REQUEST_ERROR method=GET path=/people");
    expect(content).toContain("Error: boom-request");
  });

  test("keeps only newest bytes when file exceeds max bytes", () => {
    const dir = createTempDir();
    const logPath = join(dir, "app-error.log");
    const maxBytes = 220;
    const logger = createApiErrorLogger({
      filePath: logPath,
      maxBytes,
      now: () => new Date("2026-04-08T10:00:00.000Z"),
    });

    for (let index = 0; index < 20; index += 1) {
      logger.logFatalError("unhandledRejection", `marker-${String(index)}`);
    }

    const buffer = readFileSync(logPath);
    const content = buffer.toString("utf8");
    expect(buffer.byteLength).toBeLessThanOrEqual(maxBytes);
    expect(content).toContain("marker-19");
    expect(content).not.toContain("marker-0");
  });

  test("falls back to stderr when file is not writable", () => {
    const dir = createTempDir();
    const logDirPath = join(dir, "as-directory.log");
    mkdirSync(logDirPath);
    let stderrOutput = "";
    const logger = createApiErrorLogger({
      filePath: logDirPath,
      maxBytes: 1024,
      now: () => new Date("2026-04-08T10:00:00.000Z"),
      stderrWrite: (message) => {
        stderrOutput += message;
      },
    });

    logger.logRequestError({ method: "POST", path: "/users" }, new Error("fallback-check"));

    expect(stderrOutput).toContain("REQUEST_ERROR method=POST path=/users");
    expect(stderrOutput).toContain("Error: fallback-check");
    expect(stderrOutput).toContain("[api-error-logger] file write failed:");
  });

  test("registers and unregisters process fatal error hooks", () => {
    const emitter = new EventEmitter();
    const loggerCalls: Array<{ kind: string; message: string }> = [];
    const logger: ApiErrorLogger = {
      logRequestError: () => undefined,
      logFatalError: (kind, error) => {
        loggerCalls.push({
          kind,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    };

    const unsubscribe = registerProcessFatalErrorHandlers(
      logger,
      emitter as unknown as Parameters<typeof registerProcessFatalErrorHandlers>[1],
    );

    emitter.emit("unhandledRejection", "rejected-reason");
    emitter.emit("uncaughtException", new Error("uncaught-message"));
    expect(loggerCalls).toEqual([
      { kind: "unhandledRejection", message: "rejected-reason" },
      { kind: "uncaughtException", message: "uncaught-message" },
    ]);

    unsubscribe();
    emitter.emit("unhandledRejection", "later");
    expect(loggerCalls).toHaveLength(2);
  });
});
