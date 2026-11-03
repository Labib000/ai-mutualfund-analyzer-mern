import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { now } from '../lib/today.js';
import { resetPasswordMessage } from '../mail/templates.js';
import {
    PasswordResetToken,
    RESET_TOKEN_TTL_MINUTES,
} from '../models/passwordResetToken.js';
import type { UserDoc } from '../models/user.js';
import type { AuthContext } from './context.js';

/** Laravel's passwords.users.throttle: one link per email per minute. */
const RESEND_THROTTLE_MS = 60_000;

const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

/**
 * Creates a token and emails the reset link, unless one was sent in the last
 * minute. Returns whether an email was sent.
 */
export async function sendResetLink(
    ctx: AuthContext,
    user: UserDoc,
): Promise<boolean> {
    const existing = await PasswordResetToken.findOne({ email: user.email });

    if (
        existing &&
        now().getTime() - existing.createdAt.getTime() < RESEND_THROTTLE_MS
    ) {
        return false;
    }

    const token = randomBytes(32).toString('hex');

    await PasswordResetToken.findOneAndUpdate(
        { email: user.email },
        { tokenHash: sha256(token), createdAt: now() },
        { upsert: true },
    );

    const url = new URL(`/reset-password/${token}`, ctx.config.APP_URL);
    url.searchParams.set('email', user.email);

    await ctx.mailer.send(
        resetPasswordMessage(user.email, user.name, url.toString()),
    );

    return true;
}

/** True when `token` is the live token for `email`. Does not consume it. */
export async function isValidResetToken(
    email: string,
    token: string,
): Promise<boolean> {
    const record = await PasswordResetToken.findOne({ email });

    if (!record) return false;

    const ageMs = now().getTime() - record.createdAt.getTime();
    if (ageMs > RESET_TOKEN_TTL_MINUTES * 60_000) return false;

    const a = Buffer.from(sha256(token), 'hex');
    const b = Buffer.from(record.tokenHash, 'hex');

    return a.length === b.length && timingSafeEqual(a, b);
}

export async function deleteResetToken(email: string): Promise<void> {
    await PasswordResetToken.deleteOne({ email });
}
