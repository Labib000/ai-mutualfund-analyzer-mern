import { afterEach, describe, expect, it } from 'vitest';

import { verifyPassword } from '../../src/auth/password.js';
import { setTestNow } from '../../src/lib/today.js';
import { PasswordResetToken } from '../../src/models/passwordResetToken.js';
import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { createUser, linkFrom, loginAs, makeTestApp } from '../support/app.js';

const GENERIC =
    'If that email address is registered, we have emailed a password reset link.';

/** Token and email from a reset link: /reset-password/{token}?email=… */
function parseResetLink(link: string) {
    const url = new URL(link);
    const token = url.pathname.split('/').pop()!;
    return { url, token, email: url.searchParams.get('email')! };
}

/** Port of tests/Feature/Auth/PasswordResetTest.php (+ single use, expiry). */
describe('password reset', () => {
    useTestDb();
    afterEach(() => setTestNow(null));

    it('a reset link can be requested', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();

        const res = await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email })
            .expect(200);

        expect(res.body.status).toBe(GENERIC);
        const [message] = mailer.to(user.email);
        expect(message!.subject).toBe('Reset your password');

        const { url, token, email } = parseResetLink(linkFrom(message!.text));
        expect(url.origin).toBe('http://localhost:5173');
        expect(url.pathname).toMatch(/^\/reset-password\/[a-f0-9]{64}$/);
        expect(email).toBe(user.email);

        // Only a hash of the token is stored.
        const stored = await PasswordResetToken.findOne({ email: user.email });
        expect(stored!.tokenHash).not.toBe(token);
    });

    it('answers the same for an unknown email and sends nothing', async () => {
        const { agent, mailer } = makeTestApp();

        const res = await agent()
            .post('/api/auth/forgot-password')
            .send({ email: 'nobody@example.com' })
            .expect(200);

        expect(res.body.status).toBe(GENERIC);
        expect(mailer.sent).toHaveLength(0);
    });

    it('sends at most one link a minute per email', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email })
            .expect(200);
        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email })
            .expect(200);

        expect(mailer.to(user.email)).toHaveLength(1);
    });

    it('the password can be reset with a valid token, once', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email });
        const { token, email } = parseResetLink(
            linkFrom(mailer.to(user.email)[0]!.text),
        );

        const body = {
            token,
            email,
            password: 'new-password',
            password_confirmation: 'new-password',
        };

        const res = await agent()
            .post('/api/auth/reset-password')
            .send(body)
            .expect(200);
        expect(res.body.status).toBe('Your password has been reset.');

        const fresh = await User.findById(user.id);
        expect(await verifyPassword(fresh!.passwordHash, 'new-password')).toBe(
            true,
        );

        // Single use.
        const again = await agent()
            .post('/api/auth/reset-password')
            .send(body)
            .expect(422);
        expect(again.body.errors.email).toBe(
            'This password reset token is invalid.',
        );
    });

    it('a reset signs the user out everywhere', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const elsewhere = await loginAs(agent(), user);

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email });
        const { token, email } = parseResetLink(
            linkFrom(mailer.to(user.email)[0]!.text),
        );
        await agent()
            .post('/api/auth/reset-password')
            .send({
                token,
                email,
                password: 'new-password',
                password_confirmation: 'new-password',
            })
            .expect(200);

        expect((await elsewhere.get('/api/auth/me')).body.user).toBeNull();
    });

    it('the password cannot be reset with an invalid token', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();

        const res = await agent()
            .post('/api/auth/reset-password')
            .send({
                token: 'invalid-token',
                email: user.email,
                password: 'newpassword123',
                password_confirmation: 'newpassword123',
            })
            .expect(422);

        expect(res.body.errors).toEqual({
            email: 'This password reset token is invalid.',
        });
    });

    it('the token expires after 60 minutes', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email });
        const { token, email } = parseResetLink(
            linkFrom(mailer.to(user.email)[0]!.text),
        );

        setTestNow(new Date(Date.now() + 61 * 60_000));

        await agent()
            .post('/api/auth/reset-password')
            .send({
                token,
                email,
                password: 'new-password',
                password_confirmation: 'new-password',
            })
            .expect(422);
    });

    it('a token only works for its own email', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const other = await createUser();

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email });
        const { token } = parseResetLink(
            linkFrom(mailer.to(user.email)[0]!.text),
        );

        await agent()
            .post('/api/auth/reset-password')
            .send({
                token,
                email: other.email,
                password: 'new-password',
                password_confirmation: 'new-password',
            })
            .expect(422);
    });

    it('validates the new password', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();

        await agent()
            .post('/api/auth/forgot-password')
            .send({ email: user.email });
        const { token, email } = parseResetLink(
            linkFrom(mailer.to(user.email)[0]!.text),
        );

        const res = await agent()
            .post('/api/auth/reset-password')
            .send({
                token,
                email,
                password: 'short',
                password_confirmation: 'short',
            })
            .expect(422);

        expect(res.body.errors).toEqual({
            password: 'The password field must be at least 8 characters.',
        });
    });
});
