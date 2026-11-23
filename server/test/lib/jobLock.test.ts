import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import {
    type JobLockStore,
    JobLockUnavailableError,
    JobLockedError,
    RedisJobLockStore,
    mongoJobLockStore,
    setJobLockNamespace,
    withJobLock,
} from '../../src/lib/jobLock.js';
import { createLogger } from '../../src/lib/logger.js';
import {
    connectRedis,
    disconnectRedis,
    forgetRedisPrefix,
    getRedis,
} from '../../src/lib/redis.js';
import { JobLock } from '../../src/models/jobLock.js';
import { APP_URL, TEST_SECRET } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import {
    REDIS_NOWHERE,
    REDIS_URL,
    testNamespace,
    useTestRedis,
} from '../support/redis.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The same behaviour, whichever store holds the locks. */
function jobLockStoreContract(makeStore: () => JobLockStore) {
    let store: JobLockStore;
    beforeEach(() => {
        store = makeStore();
    });

    it('gives the lock to one owner at a time', async () => {
        expect(await store.acquire('job', 'a', 60_000)).toBe(true);
        expect(await store.acquire('job', 'b', 60_000)).toBe(false);

        await store.release('job', 'a');
        expect(await store.acquire('job', 'b', 60_000)).toBe(true);
    });

    it('keeps locks separate per key', async () => {
        expect(await store.acquire('job-1', 'a', 60_000)).toBe(true);
        expect(await store.acquire('job-2', 'b', 60_000)).toBe(true);
    });

    it('only lets the owner release the lock', async () => {
        await store.acquire('job', 'a', 60_000);

        await store.release('job', 'someone-else');

        expect(await store.acquire('job', 'b', 60_000)).toBe(false);
    });

    it('lets another run take over once the lock expires', async () => {
        expect(await store.acquire('job', 'a', 50)).toBe(true);
        await sleep(80);

        expect(await store.acquire('job', 'b', 60_000)).toBe(true);
    });

    it("doesn't let a late release free the next owner's lock", async () => {
        // a's run outlives its lock; b takes over; then a finishes.
        await store.acquire('job', 'a', 50);
        await sleep(80);
        await store.acquire('job', 'b', 60_000);

        await store.release('job', 'a');

        expect(await store.acquire('job', 'c', 60_000)).toBe(false);
    });

    it('lets only one of many concurrent runs take the lock', async () => {
        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                store.acquire('race', `owner-${i}`, 60_000),
            ),
        );

        expect(results.filter(Boolean)).toHaveLength(1);
    });
}

describe('JobLockStore contract', () => {
    useTestDb();

    describe('Mongo', () => {
        jobLockStoreContract(() => mongoJobLockStore);
    });

    describe.skipIf(!REDIS_URL)('Redis', () => {
        const { lockNamespace } = useTestRedis();
        // Mongo is emptied before each test (useTestDb); Redis needs the same.
        beforeEach(() => forgetRedisPrefix(getRedis()!, lockNamespace));
        jobLockStoreContract(() => new RedisJobLockStore(lockNamespace));
    });
});

describe('withJobLock', () => {
    useTestDb();

    it('uses Mongo when Redis is not configured', async () => {
        expect(getRedis()).toBeNull();

        await withJobLock('demo', 30, async () => {
            expect(await JobLock.countDocuments({ key: 'demo' })).toBe(1);
            await expect(
                withJobLock('demo', 30, async () => 'x'),
            ).rejects.toThrow(JobLockedError);
        });
        expect(await JobLock.countDocuments()).toBe(0);
    });

    describe('when Redis is configured but down', () => {
        beforeEach(() => {
            connectRedis(REDIS_NOWHERE);
            setJobLockNamespace(testNamespace('lock'));
        });
        afterEach(async () => {
            setJobLockNamespace('hisaab:lock:');
            await disconnectRedis();
        });

        it('fails closed: skips the job and takes no Mongo lock', async () => {
            const job = vi.fn(async () => 'ran');

            await expect(withJobLock('demo', 30, job)).rejects.toThrow(
                JobLockUnavailableError,
            );
            expect(job).not.toHaveBeenCalled();
            expect(await JobLock.countDocuments()).toBe(0);
        });

        it('answers 503 on the cron endpoint, so the next call retries', async () => {
            const secret = 'cron-secret-'.padEnd(40, 'y');
            const config = loadConfig({
                NODE_ENV: 'test',
                MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
                SESSION_SECRET: TEST_SECRET,
                APP_URL,
                CRON_SECRET: secret,
            });
            const app = createApp({ config, logger: createLogger(config) });

            const res = await request(app)
                .post('/internal/jobs/sips-generate')
                .set('X-Cron-Secret', secret)
                .expect(503);

            expect(res.body.message).toMatch(
                /^Job "sips-generate" was skipped: the lock store \(Redis\) is unavailable\./,
            );
        });
    });

    describe.skipIf(!REDIS_URL)('with a real Redis', () => {
        const { lockNamespace } = useTestRedis();
        const lockKey = `${lockNamespace}demo`;

        it('holds the lock in Redis while the job runs, then releases it', async () => {
            await withJobLock('demo', 30, async () => {
                const pttl = await getRedis()!.pttl(lockKey);
                expect(pttl).toBeGreaterThan(29 * 60_000);
                expect(pttl).toBeLessThanOrEqual(30 * 60_000);

                await expect(
                    withJobLock('demo', 30, async () => 'x'),
                ).rejects.toThrow(JobLockedError);
            });

            expect(await getRedis()!.exists(lockKey)).toBe(0);
            expect(await JobLock.countDocuments()).toBe(0);
        });

        it('releases the lock when the job throws', async () => {
            await expect(
                withJobLock('demo', 30, async () => {
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');

            expect(await getRedis()!.exists(lockKey)).toBe(0);
        });
    });
});
