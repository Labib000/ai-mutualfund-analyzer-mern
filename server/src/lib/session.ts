import { MongoStore } from 'connect-mongo';
import type { RequestHandler } from 'express';
import session from 'express-session';
import type { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

import {
    SESSION_COLLECTION,
    SESSION_COOKIE,
    SESSION_IDLE_MS,
} from '../auth/sessions.js';
import type { Config } from '../config.js';

/**
 * Cookie sessions stored in Mongo, sharing Mongoose's connection pool.
 * Expired sessions are removed by the TTL index from ensureSessionIndexes().
 */
export function sessionMiddleware(config: Config): RequestHandler {
    const store = MongoStore.create({
        // Mongoose pins a slightly different driver minor than connect-mongo;
        // the client API it uses is the same.
        clientPromise: mongoose.connection
            .asPromise()
            .then((conn) => conn.getClient() as unknown as MongoClient),
        collectionName: SESSION_COLLECTION,
        stringify: false, // lets us find a user's sessions by session.userId
        autoRemove: 'disabled',
        touchAfter: 60, // write at most once a minute when nothing changed
    });

    return session({
        name: SESSION_COOKIE,
        secret: config.SESSION_SECRET,
        store,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        proxy: true,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.NODE_ENV === 'production',
            maxAge: SESSION_IDLE_MS,
        },
    });
}

export async function ensureSessionIndexes(): Promise<void> {
    const sessions = mongoose.connection.collection(SESSION_COLLECTION);
    await sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    await sessions.createIndex({ 'session.userId': 1 });
}
