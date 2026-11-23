import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { metrics } from '../../src/lib/metrics.js';
import {
    FallbackRateLimitStore,
    MongoRateLimitStore,
    RedisRateLimitStore,
    setRateLimitNamespace,
} from '../../src/lib/rateLimitStore.js';
import {
    connectRedis,
    disconnectRedis,
    getRedis,
} from '../../src/lib/redis.js';
import { RateLimit } from '../../src/models/rateLimit.js';
import { createUser, makeTestApp } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import {
    REDIS_NOWHERE,
    REDIS_URL,
    testNamespace,
    useTestRedis,
} from '../support/redis.js';

const WINDOW_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Our stores; their methods always return Promises (Store's may not). */
type AnyStore =
    | MongoRateLimitStore
    | RedisRateLimitStore
    | FallbackRateLimitStore;

const ready = <S extends AnyStore>(store: S): S => {
    store.init({ windowMs: WINDOW_MS } as never);
    return store;
};

type Backend = {
    make: (prefix: string) => AnyStore;
    /** Ends the window for `prefix:key` now, as if a minute had passed. */
    expire: (prefix: string, key: string) => Promise<void>;
    /** Whether anything is stored for `prefix:key`. */
    exists: (prefix: string, key: string) => Promise<boolean>;
};

/** The same behaviour, whichever store keeps the counters. */
function rateLimitStoreContract(backend: () => Backend) {
    let b: Backend;
    beforeEach(() => {
        b = backend();
    });

    it('counts hits in a window', async () => {
        const s = b.make('test');

        expect((await s.increment('k')).totalHits).toBe(1);
        expect((await s.increment('k')).totalHits).toBe(2);
        const third = await s.increment('k');

        expect(third.totalHits).toBe(3);
        expect(third.resetTime!.getTime()).toBeGreaterThan(Date.now() + 50_000);
        expect(third.resetTime!.getTime()).toBeLessThanOrEqual(
            Date.now() + WINDOW_MS,
        );
        expect((await s.get('k'))!.totalHits).toBe(3);
    });

    it('keeps the window fixed: later hits do not push the reset out', async () => {
        const s = b.make('test');
        const first = await s.increment('fixed');

        await sleep(50);
        const later = await s.increment('fixed');

        expect(
            Math.abs(later.resetTime!.getTime() - first.resetTime!.getTime()),
        ).toBeLessThan(25);
    });

    it('starts a new window after the old one ends', async () => {
        const s = b.make('test');
        await s.increment('k2');
        await s.increment('k2');

        await b.expire('test', 'k2');

        expect(await s.get('k2')).toBeUndefined();
        expect((await s.increment('k2')).totalHits).toBe(1);
    });

    it('is atomic under concurrent hits', async () => {
        const s = b.make('test');

        await Promise.all(
            Array.from({ length: 20 }, () => s.increment('race')),
        );

        expect((await s.get('race'))!.totalHits).toBe(20);
    });

    it('decrements and resets keys, separately per prefix', async () => {
        const s = b.make('test');
        const other = b.make('other');

        await s.increment('k3');
        await s.increment('k3');
        await other.increment('k3');

        await s.decrement('k3');
        expect((await s.get('k3'))!.totalHits).toBe(1);

        await s.resetKey('k3');
        expect(await s.get('k3')).toBeUndefined();
        expect((await other.get('k3'))!.totalHits).toBe(1);
    });

    it('never decrements below zero', async () => {
        const s = b.make('test');
        await s.increment('k4');

        await s.decrement('k4');
        await s.decrement('k4');

        expect((await s.get('k4'))?.totalHits ?? 0).toBe(0);
    });

    it('leaves nothing behind when decrementing a missing key', async () => {
        const s = b.make('test');

        await s.decrement('never-hit');

        expect(await b.exists('test', 'never-hit')).toBe(false);
    });
}

describe('RateLimitStore contract', () => {
    useTestDb();

    describe('MongoRateLimitStore', () => {
        rateLimitStoreContract(() => ({
            make: (prefix) => ready(new MongoRateLimitStore(prefix)),
            expire: async (prefix, key) => {
                await RateLimit.updateOne(
                    { key: `${prefix}:${key}` },
                    { resetAt: new Date(Date.now() - 1) },
                );
            },
            exists: async (prefix, key) =>
                (await RateLimit.exists({ key: `${prefix}:${key}` })) !== null,
        }));
    });

    describe.skipIf(!REDIS_URL)('RedisRateLimitStore', () => {
        const { rateLimitNamespace } = useTestRedis();
        const redisKey = (prefix: string, key: string) =>
            `${rateLimitNamespace}${prefix}:${key}`;

        rateLimitStoreContract(() => ({
            make: (prefix) =>
                ready(new RedisRateLimitStore(prefix, rateLimitNamespace)),
            expire: async (prefix, key) => {
                await getRedis()!.pexpire(redisKey(prefix, key), 1);
                await sleep(5);
            },
            exists: async (prefix, key) =>
                (await getRedis()!.exists(redisKey(prefix, key))) === 1,
        }));

        it('gives every counter a TTL (volatile-lru can evict it)', async () => {
            const s = ready(new RedisRateLimitStore('ttl', rateLimitNamespace));
            await s.increment('k');
            await s.increment('k');
            await s.decrement('k');

            const pttl = await getRedis()!.pttl(redisKey('ttl', 'k'));
            expect(pttl).toBeGreaterThan(0);
            expect(pttl).toBeLessThanOrEqual(WINDOW_MS);
        });

        it('repairs a counter that lost its TTL', async () => {
            const s = ready(new RedisRateLimitStore('fix', rateLimitNamespace));
            await getRedis()!.set(redisKey('fix', 'k'), '3');

            const hit = await s.increment('k');

            expect(hit.totalHits).toBe(4);
            expect(
                await getRedis()!.pttl(redisKey('fix', 'k')),
            ).toBeGreaterThan(0);
        });
    });
});

describe('FallbackRateLimitStore', () => {
    useTestDb();
    beforeEach(() => metrics.reset());

    it('uses Mongo when Redis is not configured', async () => {
        expect(getRedis()).toBeNull();
        const s = ready(new FallbackRateLimitStore('fb'));

        expect((await s.increment('k')).totalHits).toBe(1);
        expect(await RateLimit.exists({ key: 'fb:k' })).not.toBeNull();
        expect(metrics.snapshot().redis.fallbacks).toEqual({});
    });

    describe('when Redis is down', () => {
        beforeEach(() => {
            connectRedis(REDIS_NOWHERE);
            setRateLimitNamespace(testNamespace('rl'));
        });
        afterEach(async () => {
            setRateLimitNamespace('hisaab:rl:');
            await disconnectRedis();
        });

        it('falls back to Mongo for every call and counts it', async () => {
            const s = ready(new FallbackRateLimitStore('fb'));

            await s.increment('k');
            await s.increment('k');
            await s.decrement('k');
            expect((await s.get('k'))!.totalHits).toBe(1);
            await s.resetKey('k');

            expect(await RateLimit.exists({ key: 'fb:k' })).toBeNull();
            expect(metrics.snapshot().redis.fallbacks).toEqual({
                rateLimit: 5,
            });
        });

        it('still limits logins (fails open to Mongo, never 500)', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const client = agent();

            for (let i = 0; i < 5; i++) {
                await client
                    .post('/api/auth/login')
                    .send({ email: user.email, password: 'wrong-password' })
                    .expect(422);
            }
            await client
                .post('/api/auth/login')
                .send({ email: user.email, password: 'password' })
                .expect(429);
        });
    });

    describe.skipIf(!REDIS_URL)('with a real Redis', () => {
        const { rateLimitNamespace } = useTestRedis();

        const loginKeys = () =>
            getRedis()!.keys(`${rateLimitNamespace}login:*`);

        it('limits logins in Redis, with nothing written to Mongo', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const client = agent();

            for (let i = 0; i < 5; i++) {
                await client
                    .post('/api/auth/login')
                    .send({ email: user.email, password: 'wrong-password' })
                    .expect(422);
            }
            const res = await client
                .post('/api/auth/login')
                .send({ email: user.email, password: 'password' })
                .expect(429);

            expect(res.body.errors.email).toMatch(
                /^Too many login attempts\. Please try again in \d+ seconds\.$/,
            );
            expect(await RateLimit.countDocuments()).toBe(0);

            const keys = await loginKeys();
            expect(keys).toHaveLength(1);
            expect(await getRedis()!.get(keys[0]!)).toBe('6');
            expect(metrics.snapshot().redis.fallbacks).toEqual({});
        });

        it('does not count successful logins (the decrement path)', async () => {
            const { agent } = makeTestApp();
            const user = await createUser({ email: 'ok@example.com' });

            for (let i = 0; i < 3; i++) {
                await agent()
                    .post('/api/auth/login')
                    .send({ email: user.email, password: 'password' })
                    .expect(200);
            }

            const keys = (await loginKeys()).filter((k) =>
                k.includes('ok@example.com'),
            );
            expect(keys).toHaveLength(1);
            expect(await getRedis()!.get(keys[0]!)).toBe('0');
            expect(await RateLimit.countDocuments()).toBe(0);
        });
    });
});
