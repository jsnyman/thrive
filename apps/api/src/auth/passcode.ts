import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSCODE_HASH_VERSION = "v1";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

const toHex = (value: Buffer): string => value.toString("hex");
const fromHex = (value: string): Buffer => Buffer.from(value, "hex");

export const createPasscodeHash = (passcode: string): string => {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(passcode, salt, KEY_LENGTH);
  const encodedSalt = toHex(salt);
  const encodedKey = toHex(key);
  return `${PASSCODE_HASH_VERSION}:${encodedSalt}:${encodedKey}`;
};

const parseHash = (passcodeHash: string): { salt: Buffer; key: Buffer } | null => {
  const parts = passcodeHash.split(":");
  if (parts.length !== 3) {
    return null;
  }
  const version = parts[0];
  const saltHex = parts[1];
  const keyHex = parts[2];
  if (version === undefined || saltHex === undefined || keyHex === undefined) {
    return null;
  }
  if (version !== PASSCODE_HASH_VERSION) {
    return null;
  }
  if (saltHex.length === 0 || keyHex.length === 0) {
    return null;
  }
  const salt = fromHex(saltHex);
  const key = fromHex(keyHex);
  if (key.length !== KEY_LENGTH) {
    return null;
  }
  return { salt, key };
};

export const verifyPasscode = (passcode: string, passcodeHash: string): boolean => {
  const parsed = parseHash(passcodeHash);
  if (parsed === null) {
    return false;
  }
  const derived = scryptSync(passcode, parsed.salt, KEY_LENGTH);
  if (derived.length !== parsed.key.length) {
    return false;
  }
  return timingSafeEqual(derived, parsed.key);
};
