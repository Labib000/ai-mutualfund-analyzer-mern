import { describe, expect, it, vi } from 'vitest';

import { cachePut } from '../../src/lib/cache.js';
import { AiUsage } from '../../src/models/aiUsage.js';
import { CacheEntry } from '../../src/models/cacheEntry.js';
import { Holding } from '../../src/models/holding.js';
import { Sip } from '../../src/models/sip.js';
import { Transaction } from '../../src/models/transaction.js';
import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';
import {
    createForeignHolding,
    createTransaction,
} from '../support/portfolio.js';

/** Port of tests/Feature/Settings/ProfileUpdateTest.php. */
describe('profile settings', () => {
    useTestDb();

    it('profile information can be updated', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .patch('/api/settings/profile')
            .send({ name: 'Test User', email: 'test@example.com' })
            .expect(200);

        expect(res.body.message).toBe('Profile updated.');
        const fresh = await User.findById(user.id);
        expect(fresh!.name).toBe('Test User');
        expect(fresh!.email).toBe('test@example.com');
        expect(fresh!.emailVerifiedAt).toBeNull();
    });

    it('email verification status is unchanged when the email is unchanged', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await client
            .patch('/api/settings/profile')
            .send({ name: 'Test User', email: user.email })
            .expect(200);

        expect((await User.findById(user.id))!.emailVerifiedAt).not.toBeNull();
    });

    it('unverified users can still update their profile', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        await client
            .patch('/api/settings/profile')
            .send({ name: 'Fixed Name', email: user.email })
            .expect(200);
    });

    it('rejects an email that belongs to someone else', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const other = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .patch('/api/settings/profile')
            .send({ name: 'X', email: other.email.toUpperCase() })
            .expect(422);

        expect(res.body.errors).toEqual({
            email: 'The email has already been taken.',
        });
    });

    it('the user can delete their account', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        const elsewhere = await loginAs(agent(), user);

        await client
            .delete('/api/settings/profile')
            .send({ password: 'password' })
            .expect(204);

        expect(await User.findById(user.id)).toBeNull();
        expect((await client.get('/api/auth/me')).body.user).toBeNull();
        expect((await elsewhere.get('/api/auth/me')).body.user).toBeNull();
    });

    it('emails a verification link when the email changes', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await client
            .patch('/api/settings/profile')
            .send({ name: 'Test User', email: 'new@example.com' })
            .expect(200);

        expect(mailer.to('new@example.com')).toHaveLength(1);
        expect(mailer.to('new@example.com')[0]!.subject).toBe(
            'Verify your email address',
        );
    });

    it('sends no email when the email is unchanged', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await client
            .patch('/api/settings/profile')
            .send({ name: 'New Name', email: user.email })
            .expect(200);

        expect(mailer.sent).toHaveLength(0);
    });

    it('still saves the profile when the verification email fails', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        vi.spyOn(mailer, 'send').mockRejectedValueOnce(new Error('smtp down'));

        await client
            .patch('/api/settings/profile')
            .send({ name: 'Test User', email: 'new@example.com' })
            .expect(200);

        expect((await User.findById(user.id))!.email).toBe('new@example.com');
    });

    it('deleting an account removes all of its data, and only its data', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const other = await createUser();
        const client = await loginAs(agent(), user);

        const seed = async (owner: typeof user) => {
            const holding = await createForeignHolding(owner);
            await createTransaction(holding);
            await Sip.create({
                holdingId: holding._id,
                userId: owner._id,
                amountPaise: 100000,
                dayOfMonth: 5,
                startDate: '2026-01-05',
            });
            await AiUsage.create({
                userId: owner._id,
                feature: 'ask',
                provider: 'fake',
                model: 'fake',
                succeeded: true,
                createdAt: new Date(),
            });
            await cachePut(`ai-summary:${owner.id}`, 'text', 60);
            await cachePut(`ai-digest:${owner.id}:7d`, 'text', 60);
            await cachePut(`portfolio-history:${owner.id}`, [], 60);
        };
        await seed(user);
        await seed(other);

        await client
            .delete('/api/settings/profile')
            .send({ password: 'password' })
            .expect(204);

        const counts = (owner: typeof user) =>
            Promise.all([
                Holding.countDocuments({ userId: owner._id }),
                Transaction.countDocuments({ userId: owner._id }),
                Sip.countDocuments({ userId: owner._id }),
                AiUsage.countDocuments({ userId: owner._id }),
            ]);
        expect(await counts(user)).toEqual([0, 0, 0, 0]);
        expect(await counts(other)).toEqual([1, 1, 1, 1]);
        expect(await CacheEntry.countDocuments()).toBe(3);
        expect(
            await CacheEntry.countDocuments({
                key: new RegExp(other.id as string),
            }),
        ).toBe(3);
    });

    it('the correct password must be provided to delete the account', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .delete('/api/settings/profile')
            .send({ password: 'wrong-password' })
            .expect(422);

        expect(res.body.errors).toEqual({
            password: 'The password is incorrect.',
        });
        expect(await User.findById(user.id)).not.toBeNull();
    });
});
