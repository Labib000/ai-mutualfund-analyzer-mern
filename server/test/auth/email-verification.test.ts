import { describe, expect, it, afterEach } from 'vitest';

import { User } from '../../src/models/user.js';
import { setTestNow } from '../../src/lib/today.js';
import { UrlSigner } from '../../src/auth/signedUrl.js';
import { useTestDb } from '../support/db.js';
import {
    TEST_SECRET,
    createUser,
    linkFrom,
    loginAs,
    makeTestApp,
    pathOf,
} from '../support/app.js';

/** Builds a verification link like Laravel's temporarySignedRoute in the tests. */
function signedLink(id: string, hash: string, minutes = 60): string {
    const url = new URL(
        `/api/auth/verify-email/${id}/${hash}`,
        'http://localhost:5173',
    );
    return pathOf(
        new UrlSigner(TEST_SECRET)
            .sign(url, new Date(Date.now() + minutes * 60_000))
            .toString(),
    );
}

const sha1 = async (value: string) =>
    (await import('node:crypto'))
        .createHash('sha1')
        .update(value)
        .digest('hex');

/**
 * Port of tests/Feature/Auth/EmailVerificationTest.php and
 * VerificationNotificationTest.php.
 */
describe('email verification', () => {
    useTestDb();
    afterEach(() => setTestNow(null));

    it('the emailed link verifies the email', async () => {
        const { agent, mailer } = makeTestApp();
        const client = agent();
        await client
            .post('/api/auth/register')
            .send({
                name: 'Asha',
                email: 'asha@example.com',
                password: 'password',
                password_confirmation: 'password',
            })
            .expect(201);

        const link = linkFrom(mailer.to('asha@example.com')[0]!.text);
        expect(link).toMatch(
            /^http:\/\/localhost:5173\/api\/auth\/verify-email\/[a-f0-9]{24}\/[a-f0-9]{40}\?expires=\d+&signature=[a-f0-9]{64}$/,
        );

        const res = await client.get(pathOf(link)).expect(302);

        expect(res.headers.location).toBe('/dashboard?verified=1');
        const user = await User.findOne({ email: 'asha@example.com' });
        expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('is not verified with an invalid hash', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        await client
            .get(signedLink(user.id, await sha1('wrong-email')))
            .expect(403);

        expect((await User.findById(user.id))!.emailVerifiedAt).toBeNull();
    });

    it('is not verified with an invalid user id', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const other = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        await client
            .get(signedLink(other.id, await sha1(user.email)))
            .expect(403);

        expect((await User.findById(user.id))!.emailVerifiedAt).toBeNull();
        expect((await User.findById(other.id))!.emailVerifiedAt).toBeNull();
    });

    it('is not verified with a tampered signature', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        const link = signedLink(user.id, await sha1(user.email)).replace(
            /signature=([a-f0-9])/,
            (_m, c: string) => `signature=${c === 'a' ? 'b' : 'a'}`,
        );

        await client.get(link).expect(403);
        expect((await User.findById(user.id))!.emailVerifiedAt).toBeNull();
    });

    it('is not verified after the link expires (60 minutes)', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);
        const link = signedLink(user.id, await sha1(user.email));

        setTestNow(new Date(Date.now() + 61 * 60_000));

        const res = await client.get(link).expect(403);
        expect(res.body.message).toBe('This verification link has expired.');
        expect((await User.findById(user.id))!.emailVerifiedAt).toBeNull();
    });

    it('sends guests to log in first, then back to the link', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const link = signedLink(user.id, await sha1(user.email));

        const res = await agent().get(link).expect(302);

        expect(res.headers.location).toBe(
            `/login?next=${encodeURIComponent(link)}`,
        );
    });

    it('an already verified user is redirected without changing anything', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const verifiedAt = user.emailVerifiedAt!.getTime();
        const client = await loginAs(agent(), user);

        const res = await client
            .get(signedLink(user.id, await sha1(user.email)))
            .expect(302);

        expect(res.headers.location).toBe('/dashboard?verified=1');
        expect((await User.findById(user.id))!.emailVerifiedAt!.getTime()).toBe(
            verifiedAt,
        );
    });

    it('sends a verification notification', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        const res = await client
            .post('/api/auth/email/verification-notification')
            .expect(200);

        expect(res.body.status).toBe('verification-link-sent');
        expect(mailer.to(user.email)).toHaveLength(1);
    });

    it('does not send a notification if the email is verified', async () => {
        const { agent, mailer } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        const res = await client
            .post('/api/auth/email/verification-notification')
            .expect(200);

        expect(res.body.status).toBe('already-verified');
        expect(mailer.sent).toHaveLength(0);
    });

    it('throttles resends to 6 a minute', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        for (let i = 0; i < 6; i++) {
            await client
                .post('/api/auth/email/verification-notification')
                .expect(200);
        }
        await client
            .post('/api/auth/email/verification-notification')
            .expect(429);
    });
});
