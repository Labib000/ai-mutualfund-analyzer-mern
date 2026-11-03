import { describe, expect, it } from 'vitest';

import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';

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
