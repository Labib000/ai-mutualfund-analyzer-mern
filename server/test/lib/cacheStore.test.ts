import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    type CacheStore,
    RedisCacheStore,
    cacheForget,
    cacheForgetPrefix,
    cacheGet,
    cachePut,
    mongoCacheStore,
    setCacheNamespace,
} from '../../src/lib/cache.js';
import { metrics } from '../../src/lib/metrics.js';
import {
    connectRedis,
    disconnectRedis,
    getRedis,
} from '../../src/lib/redis.js';
import { useTestDb } from '../support/db.js';
import {
    REDIS_NOWHERE,
    REDIS_URL,
    testNamespace,
    useTestRedis,
} from '../support/redis.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The same behaviour, whichever store is behind the cache. */
function cacheStoreContract(makeStore: () => CacheStore) {
    let store: CacheStore;
    beforeEach(() => {
        store = makeStore();
    });

    it('returns undefined for a missing key', async () => {
        expect(await store.get('nope')).toBeUndefined();
    });

    it('stores and returns JSON values, nested ones included', async () => {
        const value = {
            version: 'v2|2026-10-07|',
            series: [{ date: '2026-10-07', valuePaise: 12345, n: null }],
            ok: true,
        };
        await store.put('scheme-stats:a', value, 60);

        expect(await store.get('scheme-stats:a')).toEqual(value);
    });

    it('stores plain strings', async () => {
        await store.put('ai-explain:x', 'An index fund…', 60);
        expect(await store.get('ai-explain:x')).toBe('An index fund…');
    });

    it('replaces a value on put', async () => {
        await store.put('k', { v: 1 }, 60);
        await store.put('k', { v: 2 }, 60);
        expect(await store.get('k')).toEqual({ v: 2 });
    });

    it('expires values after their TTL', async () => {
        await store.put('short', 'x', 1);
        expect(await store.get('short')).toBe('x');

        await sleep(1_100);
        expect(await store.get('short')).toBeUndefined();
    });

    it('forgets the given keys only', async () => {
        await store.put('a', 1, 60);
        await store.put('b', 2, 60);
        await store.put('c', 3, 60);

        await store.forget(['a', 'b', 'missing']);

        expect(await store.get('a')).toBeUndefined();
        expect(await store.get('b')).toBeUndefined();
        expect(await store.get('c')).toBe(3);
    });

    it('forgets by prefix, treating special characters literally', async () => {
        await store.put('ai-digest:u1:7d', 'x', 60);
        await store.put('ai-digest:u1:30d', 'y', 60);
        await store.put('ai-digest:u10:7d', 'other user', 60);
        await store.put('ai-summary:u1', 'kept', 60);
        await store.put('a.c*[x]:1', 'literal', 60);
        await store.put('abc:1', 'not matched by a.c*', 60);

        expect(await store.forgetPrefix('ai-digest:u1:')).toBe(2);
        expect(await store.get('ai-digest:u10:7d')).toBe('other user');
        expect(await store.get('ai-summary:u1')).toBe('kept');

        expect(await store.forgetPrefix('a.c*[x]')).toBe(1);
        expect(await store.get('abc:1')).toBe('not matched by a.c*');
    });
}

describe('CacheStore contract', () => {
    useTestDb();

    describe('MongoCacheStore', () => {
        cacheStoreContract(() => mongoCacheStore);
    });

    describe.skipIf(!REDIS_URL)('RedisCacheStore', () => {
        const { cacheNamespace } = useTestRedis();
        cacheStoreContract(() => new RedisCacheStore(cacheNamespace));
    });
});

describe('cacheGet / cachePut', () => {
    useTestDb();
    beforeEach(() => metrics.reset());

    it('uses Mongo when Redis is not configured', async () => {
        expect(getRedis()).toBeNull();

        await cachePut('portfolio-history:u1', { version: 'a' }, 60);
        expect(await cacheGet('portfolio-history:u1')).toEqual({
            version: 'a',
        });
        expect(await mongoCacheStore.get('portfolio-history:u1')).toEqual({
            version: 'a',
        });
        expect(metrics.snapshot().cache['portfolio-history']).toMatchObject({
            mongo: 2,
            redis: 0,
        });
    });

    describe('when Redis is down', () => {
        beforeEach(() => {
            connectRedis(REDIS_NOWHERE);
            setCacheNamespace(testNamespace('cache'));
        });
        afterEach(async () => {
            setCacheNamespace('hisaab:cache:');
            await disconnectRedis();
        });

        it('falls back to Mongo for each call and counts it', async () => {
            await cachePut('scheme-stats:s1', { version: 'v' }, 60);
            expect(await cacheGet('scheme-stats:s1')).toEqual({
                version: 'v',
            });

            const snapshot = metrics.snapshot();
            expect(snapshot.redis.fallbacks).toEqual({ cache: 2 });
            expect(snapshot.cache['scheme-stats']).toMatchObject({
                hits: 1,
                writes: 1,
                mongo: 2,
                redis: 0,
            });
        });

        it('refuses to forget, so callers can stop and retry', async () => {
            await mongoCacheStore.put('ai-summary:u1', 'x', 60);

            await expect(cacheForget(['ai-summary:u1'])).rejects.toThrow();
            await expect(cacheForgetPrefix('ai-digest:u1:')).rejects.toThrow();
        });
    });

    describe.skipIf(!REDIS_URL)('with a real Redis', () => {
        const { cacheNamespace } = useTestRedis();
        const redisStore = () => new RedisCacheStore(cacheNamespace);

        it('reads and writes Redis only, not Mongo', async () => {
            await cachePut('portfolio-history:u2', { version: 'b' }, 60);

            expect(await cacheGet('portfolio-history:u2')).toEqual({
                version: 'b',
            });
            expect(await redisStore().get('portfolio-history:u2')).toEqual({
                version: 'b',
            });
            expect(
                await mongoCacheStore.get('portfolio-history:u2'),
            ).toBeUndefined();
            expect(metrics.snapshot().cache['portfolio-history']).toMatchObject(
                { redis: 2, mongo: 0 },
            );
            // cacheGet plus this test's own direct read, both timed.
            expect(
                metrics.snapshot().redis.commands['cache.get'],
            ).toMatchObject({ count: 2, failed: 0 });
        });

        it('forgets from both stores', async () => {
            await redisStore().put('ai-summary:u3', 'r', 60);
            await mongoCacheStore.put('ai-summary:u3', 'm', 60);
            await redisStore().put('ai-digest:u3:7d', 'r', 60);
            await mongoCacheStore.put('ai-digest:u3:7d', 'm', 60);

            await cacheForget(['ai-summary:u3']);
            expect(await cacheForgetPrefix('ai-digest:u3:')).toBe(2);

            for (const key of ['ai-summary:u3', 'ai-digest:u3:7d']) {
                expect(await redisStore().get(key)).toBeUndefined();
                expect(await mongoCacheStore.get(key)).toBeUndefined();
            }
        });
    });
});
