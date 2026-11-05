import {
    deleteAccountSchema,
    passwordUpdateSchema,
    profileUpdateSchema,
} from '@hisaab/shared';
import { randomBytes } from 'node:crypto';
import express, { type RequestHandler, Router } from 'express';

import type { AuthContext } from '../auth/context.js';
import { deleteUserData } from '../auth/deleteUserData.js';
import { sendVerificationEmail } from '../auth/emailVerification.js';
import {
    checkPasswordStrength,
    hashPassword,
    verifyPassword,
} from '../auth/password.js';
import { deleteResetToken, sendResetLink } from '../auth/passwordReset.js';
import {
    SESSION_COOKIE,
    destroyUserSessions,
    endSession,
} from '../auth/sessions.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { perUserLimiter } from '../middleware/rateLimits.js';
import { parseOr422, sendValidationErrors } from '../middleware/validate.js';
import { Avatar } from '../models/avatar.js';
import { Holding } from '../models/holding.js';
import { User, toUserJson } from '../models/user.js';

/** The browser sends 320×320 at most; this leaves room for a detailed photo. */
const AVATAR_MAX_BYTES = 200 * 1024;

const parseJpeg = express.raw({
    type: 'image/jpeg',
    limit: AVATAR_MAX_BYTES,
});

/** The JPEG body as a Buffer, with a readable answer when it's too big. */
const jpegBody: RequestHandler = (req, res, next) => {
    parseJpeg(req, res, (err: unknown) => {
        if ((err as { status?: number } | undefined)?.status === 413) {
            res.status(413).json({
                message: 'That photo is too large. Please try a smaller one.',
            });
            return;
        }
        next(err);
    });
};

/** By its first and last bytes: only real JPEGs are stored and served back. */
function isJpeg(body: unknown): body is Buffer {
    return (
        Buffer.isBuffer(body) &&
        body.length > 4 &&
        body[0] === 0xff &&
        body[1] === 0xd8 &&
        body[2] === 0xff &&
        body.at(-2) === 0xff &&
        body.at(-1) === 0xd9
    );
}

export function settingsRouter(ctx: AuthContext): Router {
    const router = Router();

    router.use(requireAuth);

    router.get('/summary', async (req, res) => {
        res.json({
            fundCount: await Holding.countDocuments({ userId: req.user!._id }),
        });
    });

    // Always the signed-in user's own photo: there is no id to ask for another.
    router.get('/avatar', async (req, res) => {
        const avatar = await Avatar.findOne({ userId: req.user!._id });

        if (!avatar) {
            res.status(404).json({ message: 'Not found.' });
            return;
        }

        // Safe to keep: a new photo gets a new ?v= in the user's avatarUrl.
        res.set('Cache-Control', 'private, max-age=31536000, immutable')
            .type('image/jpeg')
            .send(Buffer.from(avatar.data));
    });

    router.put(
        '/avatar',
        perUserLimiter('avatar', 10),
        jpegBody,
        async (req, res) => {
            if (!isJpeg(req.body)) {
                res.status(422).json({
                    message: 'Please choose a JPG, PNG or WebP image.',
                });
                return;
            }

            const user = req.user!;

            await Avatar.updateOne(
                { userId: user._id },
                { data: req.body },
                { upsert: true },
            );
            user.avatarVersion = randomBytes(8).toString('hex');
            await user.save();

            res.json({ user: toUserJson(user), message: 'Photo updated.' });
        },
    );

    router.delete('/avatar', async (req, res) => {
        const user = req.user!;

        await Avatar.deleteOne({ userId: user._id });
        user.avatarVersion = null;
        await user.save();

        res.json({ user: toUserJson(user), message: 'Photo removed.' });
    });

    router.patch('/profile', async (req, res) => {
        const input = parseOr422(profileUpdateSchema, req.body, res);
        if (!input) return;

        const user = req.user!;
        const taken = await User.exists({
            email: input.email,
            _id: { $ne: user._id },
        });

        if (taken) {
            sendValidationErrors(res, {
                email: 'The email has already been taken.',
            });
            return;
        }

        const emailChanged = input.email !== user.email;

        if (emailChanged) {
            user.emailVerifiedAt = null;
        }
        user.name = input.name;
        user.email = input.email;
        await user.save();

        if (emailChanged) {
            await sendVerificationEmail(ctx, user).catch((err: unknown) =>
                ctx.logger.error({ err }, 'failed to send verification email'),
            );
        }

        res.json({ user: toUserJson(user), message: 'Profile updated.' });
    });

    router.delete('/profile', requireVerified, async (req, res) => {
        const input = parseOr422(deleteAccountSchema, req.body, res);
        if (!input) return;

        const user = req.user!;

        if (!(await verifyPassword(user.passwordHash, input.password))) {
            sendValidationErrors(res, {
                password: 'The password is incorrect.',
            });
            return;
        }

        await deleteUserData(user);
        await user.deleteOne();
        await endSession(req);
        await destroyUserSessions(user.id as string);

        res.clearCookie(SESSION_COOKIE).status(204).end();
    });

    router.put(
        '/password',
        requireVerified,
        perUserLimiter('password-update', 6),
        async (req, res) => {
            const input = parseOr422(passwordUpdateSchema, req.body, res);
            if (!input) return;

            const user = req.user!;

            if (
                !(await verifyPassword(
                    user.passwordHash,
                    input.current_password,
                ))
            ) {
                sendValidationErrors(res, {
                    current_password: 'The password is incorrect.',
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
            // Sign out other devices; keep this one.
            await destroyUserSessions(user.id as string, req.sessionID);

            res.json({ message: 'Password updated.' });
        },
    );

    // For a signed-in user who no longer knows their password. Unlike the public
    // forgot-password route, a failure can be reported: this reveals nothing.
    router.post(
        '/password/reset-link',
        perUserLimiter('password-reset-link', 6),
        async (req, res) => {
            const user = req.user!;

            try {
                const sent = await sendResetLink(ctx, user);

                res.json(
                    sent
                        ? { message: `Reset link sent to ${user.email}.` }
                        : {
                              message: `A link was sent to ${user.email} a moment ago. Check your inbox and spam folder.`,
                              warning: true,
                          },
                );
            } catch (err) {
                ctx.logger.error(
                    { err },
                    'failed to send password reset email',
                );
                // Otherwise the throttle would block the retry.
                await deleteResetToken(user.email);
                res.status(503).json({
                    message:
                        "We couldn't send the email. Please try again in a moment.",
                });
            }
        },
    );

    return router;
}
