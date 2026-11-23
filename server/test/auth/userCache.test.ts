import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '../../src/lib/metrics.js';
import {
    connectRedis,
    disconnectRedis,
    getRedis,
} from '../../src/lib/redis.js';
import {
    USER_CACHE_TTL_MS,
    getCachedUser,
    setUserCacheNamespace,
} from '../../src/lib/userCache.js';
import { User } from '../../src/models/user.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import {
    REDIS_NOWHERE,
    REDIS_URL,
    testNamespace,
    useTestRedis,
} from '../support/redis.js';

describe('the user lookup cache (R5)', () => {
    useTestDb();
    beforeEach(() => metrics.reset());
    afterEach(() => vi.restoreAllMocks());

    it('reads Mongo on every request when Redis is not configured', async () => {
        expect(getRedis()).toBeNull();
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        const findById = vi.spyOn(User, 'findById');

        await client.get('/api/auth/me').expect(200);
        await client.get('/api/auth/me').expect(200);

        expect(findById).toHaveBeenCalledTimes(2);
        expect(metrics.snapshot().cache.user).toBeUndefined();
    });

    describe('when Redis is configured but down', () => {
        beforeEach(() => {
            connectRedis(REDIS_NOWHERE);
            setUserCacheNamespace(testNamespace('user'));
        });
        afterEach(async () => {
            setUserCacheNamespace('hisaab:user:');
            await disconnectRedis();
        });

        it('falls back to Mongo, so requests still work', async () => {
            const { agent } = makeTestApp();
            const user = await createUser({ name: 'Asha' });
            const client = await loginAs(agent(), user);

            const res = await client.get('/api/auth/me').expect(200);

            expect(res.body.user.name).toBe('Asha');
            expect(
                metrics.snapshot().redis.fallbacks.userCache,
            ).toBeGreaterThan(0);
        });
    });

    describe.skipIf(!REDIS_URL)('with a real Redis', () => {
        const { userNamespace } = useTestRedis();
        const keyOf = (id: string) => `${userNamespace}${id}`;

        it('serves repeat requests from Redis, with real types', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);
            await client.get('/api/auth/me').expect(200); // fills the cache
            const findById = vi.spyOn(User, 'findById');

            const res = await client.get('/api/auth/me').expect(200);

            expect(res.body.user.id).toBe(user.id);
            expect(findById).not.toHaveBeenCalled();
            expect(metrics.snapshot().cache.user!.hits).toBeGreaterThan(0);

            const pttl = await getRedis()!.pttl(keyOf(user.id));
            expect(pttl).toBeGreaterThan(0);
            expect(pttl).toBeLessThanOrEqual(USER_CACHE_TTL_MS);

            const cached = await getCachedUser(user.id);
            expect(cached!.emailVerifiedAt).toBeInstanceOf(Date);
            expect(String(cached!._id)).toBe(user.id);
        });

        it('shows a changed name on the very next request', async () => {
            const { agent } = makeTestApp();
            const user = await createUser({ name: 'Old Name' });
            const client = await loginAs(agent(), user);
            await client.get('/api/auth/me').expect(200);

            await client
                .patch('/api/settings/profile')
                .send({ name: 'New Name', email: user.email })
                .expect(200);

            const res = await client.get('/api/auth/me').expect(200);
            expect(res.body.user.name).toBe('New Name');
        });

        it('forgets the old password hash after a password change', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);
            await client.get('/api/auth/me').expect(200);

            await client
                .put('/api/settings/password')
                .send({
                    current_password: 'password',
                    password: 'new-password',
                    password_confirmation: 'new-password',
                })
                .expect(200);

            // The old password no longer confirms account deletion.
            await client
                .delete('/api/settings/profile')
                .send({ password: 'password' })
                .expect(422);
            expect(await User.findById(user.id)).not.toBeNull();
        });

        it('clears the entry on a document save', async () => {
            const user = await createUser({ verified: false });
            const { agent } = makeTestApp();
            const client = await loginAs(agent(), user);
            await client.get('/api/auth/me').expect(200);
            expect(await getRedis()!.exists(keyOf(user.id))).toBe(1);

            const fresh = (await User.findById(user.id))!;
            fresh.emailVerifiedAt = new Date();
            await fresh.save();

            expect(await getRedis()!.exists(keyOf(user.id))).toBe(0);
            const res = await client.get('/api/auth/me').expect(200);
            expect(res.body.user.emailVerifiedAt).not.toBeNull();
        });

        it('clears entries on query writes too', async () => {
            const a = await createUser({ name: 'A' });
            const b = await createUser({ name: 'B' });
            const { agent } = makeTestApp();
            const clientA = await loginAs(agent(), a);
            const clientB = await loginAs(agent(), b);
            await clientA.get('/api/auth/me').expect(200);
            await clientB.get('/api/auth/me').expect(200);

            await User.updateOne({ _id: a.id }, { name: 'A2' });
            expect(await getRedis()!.exists(keyOf(a.id))).toBe(0);
            expect(await getRedis()!.exists(keyOf(b.id))).toBe(1);
            expect((await clientA.get('/api/auth/me')).body.user.name).toBe(
                'A2',
            );

            await User.deleteMany({ _id: b.id });
            expect(await getRedis()!.exists(keyOf(b.id))).toBe(0);
            expect((await clientB.get('/api/auth/me')).body.user).toBeNull();
        });

        it('forgets a deleted account', async () => {
            const { agent } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);
            const elsewhere = await loginAs(agent(), user);
            await elsewhere.get('/api/auth/me').expect(200);

            await client
                .delete('/api/settings/profile')
                .send({ password: 'password' })
                .expect(204);

            expect(await getRedis()!.exists(keyOf(user.id))).toBe(0);
            expect((await elsewhere.get('/api/auth/me')).body.user).toBeNull();
        });
    });
});
