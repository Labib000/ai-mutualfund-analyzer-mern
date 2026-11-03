import {
    type MeResponse,
    forgotPasswordSchema,
    loginSchema,
    registerSchema,
    resetPasswordSchema,
} from '@hisaab/shared';
import { Router } from 'express';

import type { AuthContext } from '../auth/context.js';
import { emailHash, sendVerificationEmail } from '../auth/emailVerification.js';
import {
    checkPasswordStrength,
    hashPassword,
    passwordRulesString,
    verifyPassword,
} from '../auth/password.js';
import {
    deleteResetToken,
    isValidResetToken,
    sendResetLink,
} from '../auth/passwordReset.js';
import {
    SESSION_COOKIE,
    destroyUserSessions,
    endSession,
    startSession,
} from '../auth/sessions.js';
import { now } from '../lib/today.js';
import { requireAuth } from '../middleware/auth.js';
import {
    loginLimiter,
    perIpLimiter,
    perUserLimiter,
} from '../middleware/rateLimits.js';
import { parseOr422, sendValidationErrors } from '../middleware/validate.js';
import { User, toUserJson } from '../models/user.js';

const FORGOT_PASSWORD_STATUS =
    'If that email address is registered, we have emailed a password reset link.';

export function authRouter(ctx: AuthContext): Router {
    const router = Router();

    router.get('/me', (req, res) => {
        const body: MeResponse = {
            user: req.user ? toUserJson(req.user) : null,
            passwordRules: passwordRulesString(ctx.passwordPolicy),
        };
        res.set('Cache-Control', 'no-store').json(body);
    });

    router.post('/register', async (req, res) => {
        const input = parseOr422(registerSchema, req.body, res);
        if (!input) return;

        const weak = await checkPasswordStrength(
            input.password,
            ctx.passwordPolicy,
        );
        const taken = await User.exists({ email: input.email });

        if (taken || weak) {
            sendValidationErrors(res, {
                ...(taken
                    ? { email: 'The email has already been taken.' }
                    : {}),
                ...(weak ? { password: weak } : {}),
            });
            return;
        }

        const user = await User.create({
            name: input.name,
            email: input.email,
            passwordHash: await hashPassword(input.password),
        });

        await startSession(req, user, false);
        await sendVerificationEmail(ctx, user).catch((err: unknown) =>
            ctx.logger.error({ err }, 'failed to send verification email'),
        );

        res.status(201).json({ user: toUserJson(user) });
    });

    router.post('/login', loginLimiter(), async (req, res) => {
        const input = parseOr422(loginSchema, req.body, res);
        if (!input) return;

        const user = await User.findOne({ email: input.email });
        const ok = user
            ? await verifyPassword(user.passwordHash, input.password)
            : false;

        if (!user || !ok) {
            sendValidationErrors(res, {
                email: 'These credentials do not match our records.',
            });
            return;
        }

        await startSession(req, user, input.remember);
        res.json({ user: toUserJson(user) });
    });

    router.post('/logout', async (req, res) => {
        await endSession(req);
        res.clearCookie(SESSION_COOKIE).status(204).end();
    });

    router.post(
        '/email/verification-notification',
        requireAuth,
        perUserLimiter('verification', 6),
        async (req, res) => {
            const user = req.user!;

            if (user.emailVerifiedAt) {
                res.json({ status: 'already-verified' });
                return;
            }

            await sendVerificationEmail(ctx, user);
            res.json({ status: 'verification-link-sent' });
        },
    );

    /**
     * The link in the verification email. Like Laravel it needs the user to be
     * signed in; guests are sent to /login and brought back afterwards.
     */
    router.get('/verify-email/:id/:hash', async (req, res) => {
        if (!req.user) {
            const next = encodeURIComponent(req.originalUrl);
            res.redirect(302, `/login?next=${next}`);
            return;
        }

        const url = new URL(req.originalUrl, ctx.config.APP_URL);
        const signature = ctx.signer.verify(url, now());
        const user = req.user;

        if (
            signature !== 'valid' ||
            req.params.id !== user.id ||
            req.params.hash !== emailHash(user.email)
        ) {
            res.status(403).json({
                message:
                    signature === 'expired'
                        ? 'This verification link has expired.'
                        : 'Invalid verification link.',
            });
            return;
        }

        if (!user.emailVerifiedAt) {
            user.emailVerifiedAt = now();
            await user.save();
        }

        res.redirect(302, '/dashboard?verified=1');
    });

    router.post(
        '/forgot-password',
        perIpLimiter('forgot-password', 6),
        async (req, res) => {
            const input = parseOr422(forgotPasswordSchema, req.body, res);
            if (!input) return;

            const user = await User.findOne({ email: input.email });

            if (user) {
                await sendResetLink(ctx, user).catch((err: unknown) =>
                    ctx.logger.error(
                        { err },
                        'failed to send password reset email',
                    ),
                );
            }

            // Same answer whether or not the email exists (no account enumeration).
            res.json({ status: FORGOT_PASSWORD_STATUS });
        },
    );

    router.post(
        '/reset-password',
        perIpLimiter('reset-password', 6),
        async (req, res) => {
            const input = parseOr422(resetPasswordSchema, req.body, res);
            if (!input) return;

            const user = await User.findOne({ email: input.email });
            const validToken = user
                ? await isValidResetToken(input.email, input.token)
                : false;

            if (!user || !validToken) {
                sendValidationErrors(res, {
                    email: 'This password reset token is invalid.',
                });
                return;
            }

            const weak = await checkPasswordStrength(
                input.password,
                ctx.passwordPolicy,
            );
            if (weak) {
                sendValidationErrors(res, { password: weak });
                return;
            }

            user.passwordHash = await hashPassword(input.password);
            await user.save();
            await deleteResetToken(input.email);
            await destroyUserSessions(user.id as string);

            res.json({ status: 'Your password has been reset.' });
        },
    );

    return router;
}
