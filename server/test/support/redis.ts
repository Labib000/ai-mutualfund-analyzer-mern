import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll } from 'vitest';

import { RedisCacheStore, setCacheNamespace } from '../../src/lib/cache.js';
import { setRateLimitNamespace } from '../../src/lib/rateLimitStore.js';
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
 * Connects to the real Redis for this test file, with the cache and rate limits
 * under their own namespaces, and deletes them afterwards. Call inside a
 * describe.skipIf(!REDIS_URL)(...).
 */
export function useTestRedis(): {
    cacheNamespace: string;
    rateLimitNamespace: string;
} {
    const cacheNamespace = testNamespace('cache');
    const rateLimitNamespace = testNamespace('rl');

    beforeAll(async () => {
        connectRedis(REDIS_URL!);
        if (!(await waitForRedis())) {
            throw new Error(`Redis at REDIS_URL is not answering`);
        }
        setCacheNamespace(cacheNamespace);
        setRateLimitNamespace(rateLimitNamespace);
    });

    afterAll(async () => {
        await new RedisCacheStore(cacheNamespace).forgetPrefix('');
        await forgetRedisPrefix(getRedis()!, rateLimitNamespace);
        setCacheNamespace('hisaab:cache:');
        setRateLimitNamespace('hisaab:rl:');
        await disconnectRedis();
    });

    return { cacheNamespace, rateLimitNamespace };
}
