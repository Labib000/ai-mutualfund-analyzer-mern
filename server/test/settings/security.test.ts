import { describe, expect, it, vi } from 'vitest';

import { verifyPassword } from '../../src/auth/password.js';
import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';

const change = {
    current_password: 'password',
    password: 'new-password',
    password_confirmation: 'new-password',
};

/** Port of tests/Feature/Settings/SecurityTest.php (password part). */
describe('security settings', () => {
    useTestDb();

    it('the password can be updated', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .put('/api/settings/password')
            .send(change)
            .expect(200);

        expect(res.body.message).toBe('Password updated.');
        const fresh = await User.findById(user.id);
        expect(await verifyPassword(fresh!.passwordHash, 'new-password')).toBe(
            true,
        );
    });

    it('signs out other sessions but keeps this one', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        const elsewhere = await loginAs(agent(), user);

        await client.put('/api/settings/password').send(change).expect(200);

        expect((await client.get('/api/auth/me')).body.user?.id).toBe(user.id);
        expect((await elsewhere.get('/api/auth/me')).body.user).toBeNull();
    });

    it('the correct current password must be provided', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .put('/api/settings/password')
            .send({ ...change, current_password: 'wrong-password' })
            .expect(422);

        expect(res.body.errors).toEqual({
            current_password: 'The password is incorrect.',
        });
    });

    it('applies the password rules to the new password', async () => {
        const { agent } = makeTestApp({ strict: true });
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .put('/api/settings/password')
            .send({
                ...change,
                password: 'short-pw',
                password_confirmation: 'short-pw',
            })
            .expect(422);

        expect(res.body.errors.password).toBe(
            'The password field must be at least 12 characters.',
        );
    });

    it('is limited to 6 attempts a minute', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);
        const wrong = { ...change, current_password: 'wrong' };

        for (let i = 0; i < 6; i++) {
            await client.put('/api/settings/password').send(wrong).expect(422);
        }
        await client.put('/api/settings/password').send(wrong).expect(429);
    });

    describe('emailing a reset link', () => {
        const LINK = '/api/settings/password/reset-link';

        it('sends a working link to the signed-in user', async () => {
            const { agent, mailer } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);

            const res = await client.post(LINK).expect(200);

            expect(res.body.message).toContain(user.email);
            expect(res.body.warning).toBeUndefined();
            expect(mailer.to(user.email)).toHaveLength(1);
            expect(mailer.to(user.email)[0]!.subject).toBe(
                'Reset your password',
            );
        });

        it('does not send a second link within a minute', async () => {
            const { agent, mailer } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);

            await client.post(LINK).expect(200);
            const res = await client.post(LINK).expect(200);

            expect(res.body.warning).toBe(true);
            expect(mailer.to(user.email)).toHaveLength(1);
        });

        it('reports a failed send and allows a retry', async () => {
            const { agent, mailer } = makeTestApp();
            const user = await createUser();
            const client = await loginAs(agent(), user);
            const send = vi
                .spyOn(mailer, 'send')
                .mockRejectedValueOnce(new Error('smtp down'));

            await client.post(LINK).expect(503);
            await client.post(LINK).expect(200);

            expect(send).toHaveBeenCalledTimes(2);
        });

        it('needs a signed-in user', async () => {
            const { agent } = makeTestApp();

            await agent().post(LINK).expect(401);
        });
    });
});
