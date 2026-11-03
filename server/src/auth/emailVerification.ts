import { createHash } from 'node:crypto';

import { now } from '../lib/today.js';
import { verifyEmailMessage } from '../mail/templates.js';
import type { UserDoc } from '../models/user.js';
import type { AuthContext } from './context.js';

export const VERIFY_LINK_TTL_MINUTES = 60;

export const emailHash = (email: string) =>
    createHash('sha1').update(email).digest('hex');

/** /api/auth/verify-email/{id}/{sha1(email)}?expires=…&signature=… */
export function verificationUrl(ctx: AuthContext, user: UserDoc): string {
    const url = new URL(
        `/api/auth/verify-email/${user.id as string}/${emailHash(user.email)}`,
        ctx.config.APP_URL,
    );
    const expiresAt = new Date(
        now().getTime() + VERIFY_LINK_TTL_MINUTES * 60_000,
    );

    return ctx.signer.sign(url, expiresAt).toString();
}

export async function sendVerificationEmail(
    ctx: AuthContext,
    user: UserDoc,
): Promise<void> {
    await ctx.mailer.send(
        verifyEmailMessage(user.email, user.name, verificationUrl(ctx, user)),
    );
}
