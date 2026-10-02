import { afterEach, expect, test, vi } from 'vitest';
import {
  codeAt,
  currentStep,
  hashRecoveryCode,
  matchingStep,
  newRecoveryCodes,
  newSecret,
  otpauthUri,
} from './two-factor.ts';

/** RFC 6238's test secret, the ASCII string "12345678901234567890", in base32. */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

afterEach(() => vi.useRealTimers());

test("matches RFC 6238's SHA-1 test vectors (last 6 of 8 digits)", () => {
  expect(codeAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
  expect(codeAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
  expect(codeAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
  expect(codeAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe('279037');
});

test('new secrets are 32 base32 characters and differ', () => {
  const secret = newSecret();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  expect(newSecret()).not.toBe(secret);
});

test('accepts the current code and one step of drift, but not older or replayed codes', () => {
  vi.useFakeTimers({ now: 1_700_000_000_000 });
  const secret = newSecret();
  const now = currentStep();
  expect(matchingStep(secret, codeAt(secret, now))).toBe(now);
  expect(matchingStep(secret, codeAt(secret, now - 1))).toBe(now - 1);
  expect(matchingStep(secret, codeAt(secret, now - 2))).toBeNull();
  expect(matchingStep(secret, codeAt(secret, now), now)).toBeNull();
  expect(matchingStep(secret, '12345')).toBeNull();
});

test('builds the otpauth link for authenticator apps', () => {
  expect(otpauthUri('ABC', 'alice')).toBe('otpauth://totp/UTTT%3Aalice?secret=ABC&issuer=UTTT');
});

test('recovery codes are distinct and match however they are typed', () => {
  const codes = newRecoveryCodes();
  expect(new Set(codes).size).toBe(10);
  expect(codes[0]).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
  expect(hashRecoveryCode(` ${codes[0].toUpperCase().replace('-', ' ')} `)).toBe(
    hashRecoveryCode(codes[0]),
  );
});
