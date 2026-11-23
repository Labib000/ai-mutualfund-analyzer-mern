import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll } from 'vitest';

import { RedisCacheStore, setCacheNamespace } from '../../src/lib/cache.js';
import { setJobLockNamespace } from '../../src/lib/jobLock.js';
import { setRateLimitNamespace } from '../../src/lib/rateLimitStore.js';
import { setUserCacheNamespace } from '../../src/lib/userCache.js';
import {
    connectRedis,
    disconnectRedis,
    forgetRedisPrefix,
    getRedis,
    waitForRedis,
} from '../../src/lib/redis.js';

/** A real Redis for the Redis test cases; unset = those cases are skipped. */
export const REDIS_URL = process.env.REDIS_URL;

/** Nothing listens on port 1, so connections are refused at once ("Redis down"). */
export const REDIS_NOWHERE = 'redis://127.0.0.1:1';

/** A namespace no other test file (or real data) uses. */
export const testNamespace = (store: string) =>
    `hisaab-test-${randomUUID().slice(0, 8)}:${store}:`;

/**
 * Connects to the real Redis for this test file, with the cache, rate limits,
 * job locks and user cache under their own namespaces, and deletes them afterwards. Call inside a
 * describe.skipIf(!REDIS_URL)(...).
 */
export function useTestRedis(): {
    cacheNamespace: string;
    rateLimitNamespace: string;
    lockNamespace: string;
    userNamespace: string;
} {
    const cacheNamespace = testNamespace('cache');
    const rateLimitNamespace = testNamespace('rl');
    const lockNamespace = testNamespace('lock');
    const userNamespace = testNamespace('user');

    beforeAll(async () => {
        connectRedis(REDIS_URL!);
        if (!(await waitForRedis())) {
            throw new Error(`Redis at REDIS_URL is not answering`);
        }
        setCacheNamespace(cacheNamespace);
        setRateLimitNamespace(rateLimitNamespace);
        setJobLockNamespace(lockNamespace);
        setUserCacheNamespace(userNamespace);
    });

    afterAll(async () => {
        await new RedisCacheStore(cacheNamespace).forgetPrefix('');
        await forgetRedisPrefix(getRedis()!, rateLimitNamespace);
        await forgetRedisPrefix(getRedis()!, lockNamespace);
        await forgetRedisPrefix(getRedis()!, userNamespace);
        setCacheNamespace('hisaab:cache:');
        setRateLimitNamespace('hisaab:rl:');
        setJobLockNamespace('hisaab:lock:');
        setUserCacheNamespace('hisaab:user:');
        await disconnectRedis();
    });

    return { cacheNamespace, rateLimitNamespace, lockNamespace, userNamespace };
}
