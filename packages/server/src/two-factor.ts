/**
 * Two-factor authentication: time-based one-time passwords (RFC 6238) as used by authenticator apps
 * (HMAC-SHA1, 30-second steps, 6 digits, base32 secret), plus single-use recovery codes.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_MS = 30_000;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new 160-bit secret, base32-encoded (32 characters). */
export function newSecret(): string {
  let bits = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits.replace(/.{5}/g, (chunk) => BASE32[parseInt(chunk, 2)]);
}

function decodeBase32(secret: string): Buffer {
  const bits = [...secret]
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? []);
}

/** The code for a 30-second time step. */
export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / STEP_MS);

/**
 * The time step `code` belongs to, allowing one step of clock drift either way, or null if it doesn't
 * match. Steps at or before `lastUsedStep` are rejected, so an observed code can't be replayed.
 */
export function matchingStep(secret: string, code: string, lastUsedStep = -1): number | null {
  const now = currentStep();
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastUsedStep) continue;
    const expected = Buffer.from(codeAt(secret, step));
    const given = Buffer.from(code);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return step;
  }
  return null;
}

/** The link authenticator apps read from the QR code. */
export function otpauthUri(secret: string, account: string): string {
  const label = encodeURIComponent(`UTTT:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=UTTT`;
}

/** Ten codes like `k3m9q-7xw2p`, shown to the user once, for when their device is lost. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const code = newSecret().slice(0, 10).toLowerCase();
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

/** Recovery codes are stored hashed; spacing, dashes, and case don't matter when typed. */
export function hashRecoveryCode(code: string): string {
  const normalized = code.toLowerCase().replace(/[^a-z2-7]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
