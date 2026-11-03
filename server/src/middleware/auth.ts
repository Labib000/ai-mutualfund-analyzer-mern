import type { RequestHandler } from 'express';

import { User, type UserDoc } from '../models/user.js';

declare module 'express-session' {
    interface SessionData {
        userId?: string;
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** The signed-in user, loaded by loadUser. */
            user?: UserDoc;
        }
    }
}

/** Loads req.user from the session (and drops sessions of deleted users). */
export const loadUser: RequestHandler = async (req, _res, next) => {
    const userId = req.session?.userId;

    if (!userId) {
        next();
        return;
    }

    const user = await User.findById(userId);

    if (user) {
        req.user = user;
    } else {
        delete req.session.userId;
    }

    next();
};

export const requireAuth: RequestHandler = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthenticated.' });
        return;
    }
    next();
};

/** Like Laravel's `verified` middleware. Use after requireAuth. */
export const requireVerified: RequestHandler = (req, res, next) => {
    if (!req.user?.emailVerifiedAt) {
        res.status(403).json({
            message: 'Your email address is not verified.',
        });
        return;
    }
    next();
};
