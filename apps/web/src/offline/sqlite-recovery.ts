const RECOVERABLE_SQLITE_PATTERNS = [
  "database disk image is malformed",
  "index out of bounds",
  "file is not a database",
  "disk i/o error",
  "unreachable executed",
  "entry not found",
  "the operation was aborted",
] as const;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const isRecoverableSqliteError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return RECOVERABLE_SQLITE_PATTERNS.some((pattern) => message.includes(pattern));
};
