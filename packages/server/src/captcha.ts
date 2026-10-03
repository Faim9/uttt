import { z } from 'zod';

/** Whether a sign-up comes from a person: checks the token the sign-up form got from Cloudflare Turnstile. */
export type HumanCheck = (token: string | undefined) => Promise<boolean>;

export const NOT_HUMAN_MESSAGE = "We couldn't confirm you're a person. Please try again.";

const SiteverifyResponse = z.object({ success: z.boolean() });

/**
 * Verifies Turnstile tokens with Cloudflare. Without a secret key (development, tests) everyone passes.
 * Fails closed: if Cloudflare can't be reached, the sign-up is refused, and the person can retry.
 */
export function turnstile(secret = process.env.TURNSTILE_SECRET_KEY): HumanCheck {
  if (!secret) return async () => true;
  return async (token) => {
    if (!token) return false;
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      return SiteverifyResponse.parse(await response.json()).success;
    } catch {
      return false;
    }
  };
}
