import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomCapability(byteCount: 16 | 32): string {
  return randomBytes(byteCount).toString("base64url");
}

export function hashCapability(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function capabilityMatches(value: string, expectedHash: Buffer): boolean {
  const actual = hashCapability(value);
  return actual.byteLength === expectedHash.byteLength && timingSafeEqual(actual, expectedHash);
}

export function signMatchReceipt(secret: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const candidate of (value ?? "").split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try { origins.add(new URL(trimmed).origin); } catch { /* invalid entries stay disabled */ }
  }
  return origins;
}

export function originAllowed(origin: string | undefined, allowed: Set<string>): boolean {
  if (!origin) return false;
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}
