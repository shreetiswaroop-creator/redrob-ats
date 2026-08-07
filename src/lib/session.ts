import { NextRequest } from "next/server";
import { UserRole } from "./types";

// Web Crypto only (crypto.subtle) — safe to import from proxy.ts (Edge
// runtime) as well as API routes (Node runtime). Password hashing lives in
// ./password.ts instead, since scrypt is Node-only.

export const SESSION_COOKIE = "ats_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionPayload {
  sub: string; // user id
  role: UserRole;
  name: string;
  email: string;
  exp: number; // epoch ms
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export async function createSessionToken(
  user: { id: string; role: UserRole; name: string; email: string },
  secret: string
): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    exp: Date.now() + SESSION_LIFETIME_MS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
}

// For API route handlers — reads the cookie straight off the request. Every
// mutating route calls this and uses the returned name/role for audit
// attribution, rather than trusting a client-supplied "actor" field.
export async function getSessionUser(req: NextRequest): Promise<SessionPayload | null> {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return null;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret);
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature) as BufferSource,
      encoder.encode(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
