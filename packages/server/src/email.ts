import type { FastifyBaseLogger } from 'fastify';
import { clockOf, type TimeControl } from '@uttt/core';
import nodemailer from 'nodemailer';
import type { Store } from './store.ts';

/**
 * Plain text only: email providers (Brevo included) add open and click tracking to HTML emails, and the
 * privacy policy promises no tracking. Plain text also keeps reset links from passing through the provider.
 */
export type SendMail = (message: { to: string; subject: string; text: string }) => Promise<void>;

const VERIFY_TTL_MS = 48 * 3_600_000;
const RESET_TTL_MS = 3_600_000;
/** At most one email of each kind per user in this time, so nobody can flood someone's inbox. */
const RESEND_AFTER_MS = 60_000;

/**
 * Sends through `SMTP_URL` (e.g. `smtps://user:pass@smtp.provider.com`), which every email provider
 * supports. Without it, emails are logged instead, which is what development wants.
 */
export function smtpMailer(log: FastifyBaseLogger): SendMail {
  const url = process.env.SMTP_URL;
  if (!url) {
    return async (message) =>
      log.warn({ email: message }, 'SMTP_URL not set: email logged, not sent');
  }
  const transport = nodemailer.createTransport(url);
  const from = process.env.MAIL_FROM ?? 'UTTT <noreply@localhost>';
  return async (message) => {
    await transport.sendMail({ from, ...message });
  };
}

/**
 * The emails the site sends. Links are built from the configured public URL, never from the request's
 * Host header, which an attacker could set to steal reset tokens.
 */
export class Emails {
  private readonly store: Store;
  private readonly send: SendMail;
  private readonly publicUrl: string;
  private readonly lastSent = new Map<string, number>();

  constructor(store: Store, send: SendMail, publicUrl: string) {
    this.store = store;
    this.send = send;
    this.publicUrl = publicUrl;
  }

  /** Whether an email of this kind went to the user too recently to send another. */
  private tooSoon(purpose: 'verify' | 'reset' | 'turn', userId: number): boolean {
    const key = `${purpose} ${userId}`;
    const now = Date.now();
    if (now - (this.lastSent.get(key) ?? 0) < RESEND_AFTER_MS) return true;
    this.lastSent.set(key, now);
    return false;
  }

  verification(user: { id: number; username: string; email: string }): Promise<void> {
    if (this.tooSoon('verify', user.id)) return Promise.resolve();
    const token = this.store.createEmailToken(user.id, 'verify', VERIFY_TTL_MS);
    return this.send({
      to: user.email,
      subject: 'Confirm your email',
      text: [
        `Welcome, ${user.username}!`,
        'Confirm your email address to play rated games:',
        `${this.publicUrl}/verify-email?token=${token}`,
        "The link works for 48 hours. If you didn't create this account, you can ignore this email.",
      ].join('\n\n'),
    });
  }

  passwordReset(user: { id: number; username: string; email: string }): Promise<void> {
    if (this.tooSoon('reset', user.id)) return Promise.resolve();
    const token = this.store.createEmailToken(user.id, 'reset', RESET_TTL_MS);
    return this.send({
      to: user.email,
      subject: 'Reset your password',
      text: [
        `Someone (hopefully you) asked to reset the password for ${user.username}.`,
        `Choose a new password here:\n${this.publicUrl}/reset-password?token=${token}`,
        "The link works for one hour. If you didn't ask, ignore this email; your password won't change.",
      ].join('\n\n'),
    });
  }

  /** It's the user's move in a correspondence game (sent only while they're away from the site). */
  yourTurn(
    userId: number,
    opponent: string,
    game: { id: string; timeControl: TimeControl },
  ): Promise<void> {
    const to = this.store.turnEmailTo(userId);
    if (!to || this.tooSoon('turn', userId)) return Promise.resolve();
    const days = clockOf(game.timeControl).initialMs / 86_400_000;
    return this.send({
      to: to.email,
      subject: `Your move against ${opponent}`,
      text: [
        `Hi ${to.username}, it's your move in your correspondence game against ${opponent}:`,
        `${this.publicUrl}/game/${game.id}`,
        `You have ${days === 1 ? 'a day' : `${days} days`} to move.`,
        `Don't want these emails? Turn them off in your settings: ${this.publicUrl}/account`,
      ].join('\n\n'),
    });
  }
}
