import { readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";

export type FatalErrorKind = "uncaughtException" | "unhandledRejection";

export type RequestErrorContext = {
  method: string;
  path: string;
};

export type ApiErrorLogger = {
  logRequestError: (context: RequestErrorContext, error: unknown) => void;
  logFatalError: (kind: FatalErrorKind, error: unknown) => void;
};

type ApiErrorLoggerOptions = {
  filePath: string;
  maxBytes: number;
  stderrWrite?: (message: string) => void;
  now?: () => Date;
};

type FatalErrorEventTarget = {
  on: (
    event: "uncaughtException" | "unhandledRejection",
    listener: (value: unknown) => void,
  ) => unknown;
  off: (
    event: "uncaughtException" | "unhandledRejection",
    listener: (value: unknown) => void,
  ) => unknown;
};

const UNKNOWN_ERROR_MESSAGE = "Unknown error";

const errorToText = (error: unknown): string => {
  if (error instanceof Error) {
    if (typeof error.stack === "string" && error.stack.length > 0) {
      return error.stack;
    }
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error === undefined) {
    return UNKNOWN_ERROR_MESSAGE;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const formatTimestamp = (now: Date): string => now.toISOString();

const formatRequestErrorEntry = (
  now: Date,
  context: RequestErrorContext,
  error: unknown,
): string => {
  const timestamp = formatTimestamp(now);
  const body = errorToText(error);
  return `[${timestamp}] REQUEST_ERROR method=${context.method} path=${context.path}\n${body}\n\n`;
};

const formatFatalErrorEntry = (now: Date, kind: FatalErrorKind, error: unknown): string => {
  const timestamp = formatTimestamp(now);
  const body = errorToText(error);
  return `[${timestamp}] FATAL_ERROR kind=${kind}\n${body}\n\n`;
};

const trimToMaxBytes = (value: Buffer, maxBytes: number): Buffer => {
  if (value.byteLength <= maxBytes) {
    return value;
  }
  return value.subarray(value.byteLength - maxBytes);
};

const appendWithTruncation = (filePath: string, maxBytes: number, entry: string): void => {
  const entryBuffer = Buffer.from(entry, "utf8");
  const existingBuffer = (() => {
    try {
      return readFileSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return Buffer.alloc(0);
      }
      throw error;
    }
  })();
  const combined =
    existingBuffer.byteLength === 0 ? entryBuffer : Buffer.concat([existingBuffer, entryBuffer]);
  const next = trimToMaxBytes(combined, maxBytes);
  writeFileSync(filePath, next);
};

export const createApiErrorLogger = (options: ApiErrorLoggerOptions): ApiErrorLogger => {
  const stderrWrite = options.stderrWrite ?? ((message: string) => process.stderr.write(message));
  const now = options.now ?? (() => new Date());

  const writeEntry = (entry: string): void => {
    try {
      appendWithTruncation(options.filePath, options.maxBytes, entry);
    } catch (error) {
      const failureMessage = errorToText(error);
      stderrWrite(`${entry}[api-error-logger] file write failed: ${failureMessage}\n`);
    }
  };

  const logRequestError = (context: RequestErrorContext, error: unknown): void => {
    writeEntry(formatRequestErrorEntry(now(), context, error));
  };

  const logFatalError = (kind: FatalErrorKind, error: unknown): void => {
    writeEntry(formatFatalErrorEntry(now(), kind, error));
  };

  return {
    logRequestError,
    logFatalError,
  };
};

export const createStderrOnlyApiErrorLogger = (options?: {
  now?: () => Date;
  stderrWrite?: (message: string) => void;
}): ApiErrorLogger => {
  const now = options?.now ?? (() => new Date());
  const stderrWrite = options?.stderrWrite ?? ((message: string) => process.stderr.write(message));
  return {
    logRequestError: (context, error) => {
      stderrWrite(formatRequestErrorEntry(now(), context, error));
    },
    logFatalError: (kind, error) => {
      stderrWrite(formatFatalErrorEntry(now(), kind, error));
    },
  };
};

export const toRequestPath = (url: string | undefined): string => {
  const parsed = new URL(url ?? "/", "http://localhost");
  return parsed.pathname;
};

export const registerProcessFatalErrorHandlers = (
  logger: ApiErrorLogger,
  target: FatalErrorEventTarget = process,
): (() => void) => {
  const onUncaughtException = (error: unknown): void => {
    logger.logFatalError("uncaughtException", error);
  };
  const onUnhandledRejection = (reason: unknown): void => {
    logger.logFatalError("unhandledRejection", reason);
  };
  target.on("uncaughtException", onUncaughtException);
  target.on("unhandledRejection", onUnhandledRejection);
  return (): void => {
    target.off("uncaughtException", onUncaughtException);
    target.off("unhandledRejection", onUnhandledRejection);
  };
};
