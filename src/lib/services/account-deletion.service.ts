/**
 * Self-service account deletion, confirmed by emailed link.
 *
 * Sign-in here is passwordless (Google + magic link), so there is no password to
 * re-prompt for as a deletion safeguard. The equivalent proof is a one-time link sent
 * to the account's own address: requesting deletion from a hijacked session is not
 * enough — the attacker also has to hold the mailbox.
 *
 * Tokens are stored hashed. A leaked database row therefore can't be replayed as a
 * working confirmation link, and the raw token exists only in the email we sent.
 */

import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/email';
import { communicationAppUrl, communicationSupportEmail } from '@/lib/communication-brand.server';
import { PRODUCT_NAME } from '@/lib/branding';
import { rateLimit } from '@/lib/rate-limit';
import { deleteUserAccount } from '@/lib/services/gdpr.service';

/** Long enough to read the email without leaving a deletion link live all day. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export type DeletionRequestResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string };

export async function requestAccountDeletion(userId: string): Promise<DeletionRequestResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { ok: false, error: 'Account not found.' };

  // Same reasoning as the magic-link provider: this endpoint sends mail to a real
  // inbox, so cap it before the send rather than after.
  const limit = rateLimit(`account-deletion:${user.id}`, 3, 15 * 60 * 1000);
  if (!limit.success) {
    return {
      ok: false,
      error: 'Too many deletion requests. Please wait a few minutes and try again.',
    };
  }

  // Any earlier link becomes dead the moment a new one is issued, so a request the
  // user didn't mean to make can be cancelled simply by requesting another.
  await db.accountDeletionToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = randomBytes(32).toString('hex');
  await db.accountDeletionToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const url = communicationAppUrl(`/account/privacy/confirm?token=${token}`);
  await sendTransactionalEmail({
    to: user.email,
    sender: 'support',
    subject: `Confirm deletion of your ${PRODUCT_NAME} account`,
    text:
      `Hi ${user.name},\n\n` +
      `We received a request to permanently delete your ${PRODUCT_NAME} account.\n\n` +
      `Confirm here (link expires in 1 hour):\n${url}\n\n` +
      `This cannot be undone. If you didn't request this, ignore this email — ` +
      `your account stays exactly as it is, and you may want to sign out of any ` +
      `devices you don't recognise.\n\n` +
      `Questions? ${communicationSupportEmail()}`,
    html:
      `<p>Hi ${user.name},</p>` +
      `<p>We received a request to permanently delete your <strong>${PRODUCT_NAME}</strong> account.</p>` +
      `<p><a href="${url}">Confirm account deletion</a> (link expires in 1 hour)</p>` +
      `<p>This cannot be undone. If you didn't request this, ignore this email — your account ` +
      `stays exactly as it is, and you may want to sign out of any devices you don't recognise.</p>` +
      `<p>Questions? <a href="mailto:${communicationSupportEmail()}">${communicationSupportEmail()}</a></p>`,
  });

  return { ok: true, sentTo: user.email };
}

export type DeletionTokenCheck =
  | { valid: true; userId: string; email: string }
  | { valid: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Resolves a raw token to its owner. Read-only — call `confirmAccountDeletion` to
 * actually delete, so that landing on the confirmation page (link prefetchers,
 * antivirus scanners, mail-client previews) never destroys an account by itself.
 */
export async function checkDeletionToken(token: string): Promise<DeletionTokenCheck> {
  if (!token) return { valid: false, reason: 'invalid' };

  const record = await db.accountDeletionToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!record) return { valid: false, reason: 'invalid' };
  if (record.usedAt) return { valid: false, reason: 'used' };
  if (record.expires.getTime() < Date.now()) return { valid: false, reason: 'expired' };

  return { valid: true, userId: record.userId, email: record.user.email };
}

/**
 * Consumes the token and deletes the account. `sessionUserId` must match the token's
 * owner: the link alone can't delete an account belonging to someone else, and a
 * stolen link is useless without also being signed in as that user.
 */
export async function confirmAccountDeletion(
  token: string,
  sessionUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await checkDeletionToken(token);
  if (!check.valid) {
    return {
      ok: false,
      error:
        check.reason === 'expired'
          ? 'This confirmation link has expired. Please request a new one.'
          : check.reason === 'used'
            ? 'This confirmation link has already been used.'
            : 'This confirmation link is not valid.',
    };
  }

  const a = Buffer.from(check.userId);
  const b = Buffer.from(sessionUserId);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'This confirmation link belongs to a different account.' };
  }

  // Mark used before deleting. The row is removed by the cascade on success; if the
  // deletion fails partway, the token is already spent and can't be retried blindly.
  await db.accountDeletionToken.update({
    where: { tokenHash: hashToken(token) },
    data: { usedAt: new Date() },
  });

  await deleteUserAccount(check.userId);
  return { ok: true };
}
