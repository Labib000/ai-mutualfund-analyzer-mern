import type { Request } from 'express';
import mongoose from 'mongoose';

import type { UserDoc } from '../models/user.js';

export const SESSION_COLLECTION = 'sessions';
export const SESSION_COOKIE = 'hisaab_session';
export const SESSION_IDLE_MS = 120 * 60 * 1000; // Laravel SESSION_LIFETIME=120
export const REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;

/** Logs the user in on a fresh session id (prevents session fixation). */
export function startSession(
    req: Request,
    user: UserDoc,
    remember: boolean,
): Promise<void> {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);

            req.session.userId = user.id as string;
            req.session.cookie.maxAge = remember
                ? REMEMBER_ME_MS
                : SESSION_IDLE_MS;
            req.session.save((saveErr) =>
                saveErr ? reject(saveErr) : resolve(),
            );
        });
    });
}

/** Destroys the current session. */
export function endSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
}

/**
 * Signs the user out everywhere else (after a password change or reset),
 * or everywhere when `exceptSessionId` is omitted.
 */
export async function destroyUserSessions(
    userId: string,
    exceptSessionId?: string,
): Promise<void> {
    const filter: Record<string, unknown> = { 'session.userId': userId };

    if (exceptSessionId) {
        filter._id = { $ne: exceptSessionId };
    }

    await mongoose.connection.collection(SESSION_COLLECTION).deleteMany(filter);
}
