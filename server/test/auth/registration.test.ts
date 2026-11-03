import { describe, expect, it } from 'vitest';

import { verifyPassword } from '../../src/auth/password.js';
import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { createUser, makeTestApp } from '../support/app.js';

const valid = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password',
    password_confirmation: 'password',
};

/** Port of tests/Feature/Auth/RegistrationTest.php (+ validation). */
describe('registration', () => {
    useTestDb();

    it('new users can register, are logged in and get a verification email', async () => {
        const { agent, mailer } = makeTestApp();
        const client = agent();

        const res = await client
            .post('/api/auth/register')
            .send(valid)
            .expect(201);

        expect(res.body.user).toMatchObject({
            name: 'Test User',
            email: 'test@example.com',
            emailVerifiedAt: null,
        });

        const me = await client.get('/api/auth/me');
        expect(me.body.user.email).toBe('test@example.com');

        const user = await User.findOne({ email: 'test@example.com' });
        expect(user).not.toBeNull();
        expect(user!.passwordHash).not.toBe('password');
        expect(await verifyPassword(user!.passwordHash, 'password')).toBe(true);

        expect(mailer.to('test@example.com')).toHaveLength(1);
        expect(mailer.sent[0]!.subject).toBe('Verify your email address');
    });

    it('stores the email lower-cased and trimmed', async () => {
        const { agent } = makeTestApp();

        await agent()
            .post('/api/auth/register')
            .send({ ...valid, email: '  Test@Example.COM ' })
            .expect(201);

        expect(await User.exists({ email: 'test@example.com' })).toBeTruthy();
    });

    it('rejects a taken email, case-insensitively', async () => {
        const { agent } = makeTestApp();
        await createUser({ email: 'test@example.com' });

        const res = await agent()
            .post('/api/auth/register')
            .send({ ...valid, email: 'TEST@example.com' })
            .expect(422);

        expect(res.body.errors).toEqual({
            email: 'The email has already been taken.',
        });
    });

    it('requires the password confirmation to match', async () => {
        const { agent } = makeTestApp();

        const res = await agent()
            .post('/api/auth/register')
            .send({ ...valid, password_confirmation: 'different' })
            .expect(422);

        expect(res.body.errors).toEqual({
            password: 'The password field confirmation does not match.',
        });
    });

    it('validates name and email', async () => {
        const { agent } = makeTestApp();

        const res = await agent()
            .post('/api/auth/register')
            .send({
                ...valid,
                name: '',
                email: 'x'.repeat(250) + '@example.com',
            })
            .expect(422);

        expect(res.body.errors).toEqual({
            name: 'The name field is required.',
            email: 'The email field must not be greater than 255 characters.',
        });
    });

    it('enforces at least 8 characters outside production', async () => {
        const { agent } = makeTestApp();

        const res = await agent()
            .post('/api/auth/register')
            .send({
                ...valid,
                password: 'short',
                password_confirmation: 'short',
            })
            .expect(422);

        expect(res.body.errors).toEqual({
            password: 'The password field must be at least 8 characters.',
        });
    });

    it('enforces the production rules when strict', async () => {
        const { agent, pwned } = makeTestApp({ strict: true });
        const attempt = (password: string) =>
            agent()
                .post('/api/auth/register')
                .send({ ...valid, password, password_confirmation: password });

        expect((await attempt('password')).body.errors.password).toBe(
            'The password field must be at least 12 characters.',
        );
        expect((await attempt('alllowercase1!')).body.errors.password).toBe(
            'The password field must contain at least one uppercase and one lowercase letter.',
        );
        expect((await attempt('NoNumbersHere!')).body.errors.password).toBe(
            'The password field must contain at least one number.',
        );
        expect((await attempt('NoSymbols12345')).body.errors.password).toBe(
            'The password field must contain at least one symbol.',
        );

        pwned.mockResolvedValueOnce(true);
        expect((await attempt('Leaked-Pass-123')).body.errors.password).toBe(
            'The given password has appeared in a data leak. Please choose a different password.',
        );

        await attempt('Str0ng-Enough-Pass').expect(201);
    });
});
