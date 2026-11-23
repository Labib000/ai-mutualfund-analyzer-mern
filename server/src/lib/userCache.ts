/**
 * Caches the user document that loadUser reads on every API request (R5).
 *
 * Sessions stay in Mongo: a session is the only copy of a login, so it can't
 * fall back anywhere if Redis is down or evicts it. The user document is safe
 * to cache because Mongo stays the source of truth: any Redis problem just
 * means one more Mongo read.
 *
 * Redis only. With REDIS_URL unset there is no cache, because a Mongo cache in
 * front of Mongo would save nothing.
 *
 * Values are EJSON, not JSON, so Dates and ObjectIds come back as themselves
 * and User.hydrate() rebuilds a real document that can still save().
 *
 * Entries are cleared by hooks on the User schema (models/user.ts) on every
 * write. The 60 s TTL is the safety net, bounding how stale an entry can get
 * if a clear fails or races with a read.
 */
import mongoose from 'mongoose';

import { metrics } from './metrics.js';
import { getRedis, redisFallback, timedRedis, warnRedis } from './redis.js';

const { EJSON } = mongoose.mongo.BSON;

export const USER_CACHE_TTL_MS = 60_000;

let namespace = 'hisaab:user:';

/** Tests: keep this file's Redis keys under their own namespace. */
export function setUserCacheNamespace(ns: string): void {
    namespace = ns;
}

const keyFor = (id: string) => `${namespace}${id}`;

/** Whether the cache is in use (Redis configured). */
export function userCacheEnabled(): boolean {
    return getRedis() !== null;
}

/** The cached user's fields, or undefined (miss, no Redis, or Redis failed). */
export async function getCachedUser(
    id: string,
): Promise<Record<string, unknown> | undefined> {
    if (!userCacheEnabled()) return undefined;

    try {
        const raw = await timedRedis('userCache.get', (redis) =>
            redis.get(keyFor(id)),
        );
        metrics.recordCache(
            `user:${id}`,
            raw === null ? 'miss' : 'hit',
            'redis',
        );
        return raw === null
            ? undefined
            : (EJSON.parse(raw) as Record<string, unknown>);
    } catch (error) {
        redisFallback('userCache', error);
        return undefined;
    }
}

/** Caches a user's fields (from `user.toObject()`) for 60 s. */
export async function putCachedUser(id: string, fields: object): Promise<void> {
    if (!userCacheEnabled()) return;

    try {
        await timedRedis('userCache.put', (redis) =>
            redis.set(
                keyFor(id),
                EJSON.stringify(fields),
                'PX',
                USER_CACHE_TTL_MS,
            ),
        );
        metrics.recordCache(`user:${id}`, 'write', 'redis');
    } catch (error) {
        // Nothing to fall back to: the next request reads Mongo again.
        warnRedis('userCache', 'Could not cache user', error);
    }
}

/** Clears users after a write. A failure is logged; the TTL bounds staleness. */
export async function forgetCachedUsers(ids: readonly string[]): Promise<void> {
    if (!userCacheEnabled() || ids.length === 0) return;

    try {
        await timedRedis('userCache.forget', (redis) =>
            redis.unlink(...ids.map(keyFor)),
        );
    } catch (error) {
        warnRedis('userCache', 'Could not clear cached user', error);
    }
}
