import { afterEach, describe, expect, it } from 'vitest';

import {
    RedisCacheStore,
    cachePut,
    mongoCacheStore,
    setCacheNamespace,
} from '../../src/lib/cache.js';
import { connectRedis, disconnectRedis } from '../../src/lib/redis.js';
import { User } from '../../src/models/user.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import {
    REDIS_NOWHERE,
    REDIS_URL,
    testNamespace,
    useTestRedis,
} from '../support/redis.js';

/** Cached entries that quote a user's own figures. */
const userKeys = (id: string) => [
    `ai-summary:${id}`,
    `portfolio-history:${id}`,
    `ai-digest:${id}:7d`,
    `ai-digest:${id}:month`,
];

describe('Deleting an account clears its cached figures', () => {
    useTestDb();

    describe.skipIf(!REDIS_URL)('from Redis', () => {
        const { cacheNamespace } = useTestRedis();
        const redisStore = () => new RedisCacheStore(cacheNamespace);

        it("removes the user's keys and keeps everyone else's", async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const other = await createUser();
            for (const key of [...userKeys(user.id), ...userKeys(other.id)]) {
                await cachePut(key, { version: 'v' }, 3_600);
            }
            const client = await loginAs(agent(), user);

            await client
                .delete('/api/settings/profile')
                .send({ password: 'password' })
                .expect(204);

            for (const key of userKeys(user.id)) {
                expect(await redisStore().get(key)).toBeUndefined();
            }
            for (const key of userKeys(other.id)) {
                expect(await redisStore().get(key)).toEqual({ version: 'v' });
            }
        });
    });

    describe('when Redis is configured but down', () => {
        afterEach(async () => {
            setCacheNamespace('hisaab:cache:');
            await disconnectRedis();
        });

        it('fails without deleting the account, so the user can retry', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            await mongoCacheStore.put(`ai-summary:${user.id}`, 'x', 3_600);
            const client = await loginAs(agent(), user);

            connectRedis(REDIS_NOWHERE);
            setCacheNamespace(testNamespace('cache'));

            await client
                .delete('/api/settings/profile')
                .send({ password: 'password' })
                .expect(500);

            expect(await User.findById(user.id)).not.toBeNull();
        });
    });
});
