import { createHash } from 'node:crypto';

export type BreachCheck = (password: string) => Promise<boolean>;

export const BREACHED_MESSAGE =
  'This password has appeared in a data breach, so attackers try it. Please choose another.';

/**
 * Checks Have I Been Pwned's corpus of breached passwords using k-anonymity: only the first 5 hex
 * characters of the password's SHA-1 leave the server. Fails open, so an outage never blocks sign-ups.
 */
export const isBreached: BreachCheck = async (password) => {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const suffix = hash.slice(5);
    // Each line is `SUFFIX:COUNT`; padding lines have a count of 0.
    return (await response.text()).split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
};
