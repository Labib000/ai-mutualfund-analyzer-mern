import {
    deleteAccountSchema,
    passwordUpdateSchema,
    profileUpdateSchema,
} from '@hisaab/shared';
import { Router } from 'express';

import type { AuthContext } from '../auth/context.js';
import {
    checkPasswordStrength,
    hashPassword,
    verifyPassword,
} from '../auth/password.js';
import {
    SESSION_COOKIE,
    destroyUserSessions,
    endSession,
} from '../auth/sessions.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { perUserLimiter } from '../middleware/rateLimits.js';
import { parseOr422, sendValidationErrors } from '../middleware/validate.js';
import { User, toUserJson } from '../models/user.js';

export function settingsRouter(ctx: AuthContext): Router {
    const router = Router();

    router.use(requireAuth);

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

        if (input.email !== user.email) {
            user.emailVerifiedAt = null;
        }
        user.name = input.name;
        user.email = input.email;
        await user.save();

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

        // Phase 2 adds the user's holdings, SIPs and transactions here.
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

    return router;
}
