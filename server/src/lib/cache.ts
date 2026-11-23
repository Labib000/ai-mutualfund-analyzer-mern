/**
 * Key-value cache, like Laravel's Cache facade (cache-aside: callers check,
 * compute on a miss, then put).
 *
 * Two stores behind one API (R2, Phase 4.4):
 * - Redis, when REDIS_URL is set: the only store used while it works.
 * - Mongo (the `cache` collection): used when Redis isn't configured, and for
 *   any single call where Redis fails (fallback). We never write to both, so
 *   Redis takes the load off Atlas instead of adding to it.
 *
 * Callers store versioned values ({ version, ... }) and compare the version on
 * read, so a stale copy left in either store is never served as current.
 *
 * Deletes (cacheForget, cacheForgetPrefix) go to both stores, so a value
 * written to Mongo during a Redis outage can't outlive a delete.
 */
import { CacheEntry } from '../models/cacheEntry.js';
import { metrics } from './metrics.js';
import {
    forgetRedisPrefix,
    getRedis,
    redisFallback,
    timedRedis,
} from './redis.js';

export type CacheBackend = 'redis' | 'mongo';

export interface CacheStore {
    /** The value, or undefined when missing or expired. */
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    forget(keys: readonly string[]): Promise<void>;
    /** Deletes every key starting with `prefix`; returns how many. */
    forgetPrefix(prefix: string): Promise<number>;
}

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The `cache` collection; a TTL index removes expired entries. */
export const mongoCacheStore: CacheStore = {
    async get<T>(key: string): Promise<T | undefined> {
        // Expiry is real time, not the app's (test-frozen) clock, because the TTL
        // monitor deletes by real time too. It runs once a minute, so check here.
        const entry = await CacheEntry.findOne({
            key,
            expiresAt: { $gt: new Date() },
        }).lean();
        return entry ? (entry.value as T) : undefined;
    },

    async put(key, value, ttlSeconds) {
        await CacheEntry.updateOne(
            { key },
            {
                $set: {
                    value,
                    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
                },
            },
            { upsert: true },
        );
    },

    async forget(keys) {
        if (keys.length === 0) return;
        await CacheEntry.deleteMany({ key: { $in: [...keys] } });
    },

    async forgetPrefix(prefix) {
        const { deletedCount } = await CacheEntry.deleteMany(
            prefix === ''
                ? {}
                : { key: new RegExp(`^${escapeRegExp(prefix)}`) },
        );
        return deletedCount;
    },
};

/**
 * Values as JSON strings under `<namespace><key>`, expiring through Redis
 * (SET ... PX). Every call is timed in the metrics as cache.<op>.
 */
export class RedisCacheStore implements CacheStore {
    constructor(readonly namespace = 'hisaab:cache:') {}

    async get<T>(key: string): Promise<T | undefined> {
        const raw = await timedRedis('cache.get', (redis) =>
            redis.get(this.namespace + key),
        );
        if (raw === null) return undefined;

        try {
            return JSON.parse(raw) as T;
        } catch {
            return undefined; // Not ours or corrupt: treat as a miss.
        }
    }

    async put(key: string, value: unknown, ttlSeconds: number) {
        await timedRedis('cache.put', (redis) =>
            redis.set(
                this.namespace + key,
                JSON.stringify(value),
                'PX',
                Math.max(1, Math.round(ttlSeconds * 1000)),
            ),
        );
    }

    async forget(keys: readonly string[]) {
        if (keys.length === 0) return;
        await timedRedis('cache.forget', (redis) =>
            redis.unlink(...keys.map((k) => this.namespace + k)),
        );
    }

    /** SCAN then UNLINK (see forgetRedisPrefix). */
    async forgetPrefix(prefix: string) {
        return timedRedis('cache.forgetPrefix', (redis) =>
            forgetRedisPrefix(redis, this.namespace + prefix),
        );
    }
}

let redisCacheStore = new RedisCacheStore();

/** Tests: keep this file's Redis keys under their own namespace. */
export function setCacheNamespace(namespace: string): void {
    redisCacheStore = new RedisCacheStore(namespace);
}

/** The cached value, or undefined when missing or expired. */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
    if (getRedis()) {
        try {
            const value = await redisCacheStore.get<T>(key);
            metrics.recordCache(
                key,
                value === undefined ? 'miss' : 'hit',
                'redis',
            );
            return value;
        } catch (error) {
            redisFallback('cache', error);
        }
    }

    const value = await mongoCacheStore.get<T>(key);
    metrics.recordCache(key, value === undefined ? 'miss' : 'hit', 'mongo');
    return value;
}

export async function cachePut(
    key: string,
    value: unknown,
    ttlSeconds: number,
): Promise<void> {
    if (getRedis()) {
        try {
            await redisCacheStore.put(key, value, ttlSeconds);
            metrics.recordCache(key, 'write', 'redis');
            return;
        } catch (error) {
            redisFallback('cache', error);
        }
    }

    await mongoCacheStore.put(key, value, ttlSeconds);
    metrics.recordCache(key, 'write', 'mongo');
}

/**
 * Deletes keys from both stores. Throws if Redis is configured but fails, so a
 * caller that must not leave data behind (account deletion) stops and can retry.
 */
export async function cacheForget(keys: readonly string[]): Promise<void> {
    await mongoCacheStore.forget(keys);
    if (getRedis()) await redisCacheStore.forget(keys);
}

/**
 * Deletes every key starting with `prefix` ('' = the whole cache) from both
 * stores; returns how many. Throws like cacheForget.
 */
export async function cacheForgetPrefix(prefix: string): Promise<number> {
    let deleted = await mongoCacheStore.forgetPrefix(prefix);
    if (getRedis()) deleted += await redisCacheStore.forgetPrefix(prefix);
    return deleted;
}
