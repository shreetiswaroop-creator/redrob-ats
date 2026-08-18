import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Node-only (uses node:crypto's scrypt) — import this from API route handlers
// only, never from proxy.ts, which may run on the Edge runtime.
const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = await scrypt(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

// Forgot-password reset tokens: the raw token (256 bits — already high
// entropy) goes out in the email link; only its SHA-256 hash is persisted.
// A fast hash is fine here, unlike password hashing — the whole point of
// scrypt's cost factor is to slow down guessing a low-entropy secret, and a
// random 256-bit token has nothing to guess.
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
