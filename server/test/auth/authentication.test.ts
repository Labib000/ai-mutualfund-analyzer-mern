import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { User } from '../../src/models/user.js';
import { useTestDb } from '../support/db.js';
import { APP_URL, createUser, loginAs, makeTestApp } from '../support/app.js';

/** Port of tests/Feature/Auth/AuthenticationTest.php (+ session checks). */
describe('authentication', () => {
    useTestDb();

    it('users can authenticate', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = agent();

        const res = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' })
            .expect(200);

        expect(res.body.user).toMatchObject({ id: user.id, email: user.email });

        const me = await client.get('/api/auth/me').expect(200);
        expect(me.body.user.id).toBe(user.id);
    });

    it('matches the email case-insensitively', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ email: 'mixed@example.com' });

        await agent()
            .post('/api/auth/login')
            .send({ email: '  MIXED@Example.com ', password: 'password' })
            .expect(200);
        expect(user.email).toBe('mixed@example.com');
    });

    it('users can not authenticate with an invalid password', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = agent();

        const res = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'wrong-password' })
            .expect(422);

        expect(res.body.errors).toEqual({
            email: 'These credentials do not match our records.',
        });
        expect((await client.get('/api/auth/me')).body.user).toBeNull();
    });

    it('gives the same error for an unknown email', async () => {
        const { agent } = makeTestApp();

        const res = await agent()
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'password' })
            .expect(422);

        expect(res.body.errors.email).toBe(
            'These credentials do not match our records.',
        );
    });

    it('validates the login form', async () => {
        const { agent } = makeTestApp();

        const res = await agent()
            .post('/api/auth/login')
            .send({ email: 'not-an-email' })
            .expect(422);

        expect(res.body.errors).toEqual({
            email: 'The email field must be a valid email address.',
            password: 'The password field is required.',
        });
        expect(res.body.message).toBe(
            'The email field must be a valid email address. (and 1 more error)',
        );
    });

    it('users can logout', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await client.post('/api/auth/logout').expect(204);

        expect((await client.get('/api/auth/me')).body.user).toBeNull();
    });

    it('a logged-out session cookie cannot be replayed', async () => {
        const { app, agent } = makeTestApp();
        const user = await createUser();
        const client = agent();

        const login = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' });
        const cookie = login.headers['set-cookie']!;

        await client.post('/api/auth/logout').expect(204);

        const replay = await request(app)
            .get('/api/auth/me')
            .set('Cookie', cookie);
        expect(replay.body.user).toBeNull();
    });

    it('users are rate limited after 5 failed attempts', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = agent();

        for (let i = 0; i < 5; i++) {
            await client
                .post('/api/auth/login')
                .send({ email: user.email, password: 'wrong-password' })
                .expect(422);
        }

        const res = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' })
            .expect(429);

        expect(res.body.errors.email).toMatch(
            /^Too many login attempts\. Please try again in \d+ seconds\.$/,
        );
    });

    it('successful logins do not count towards the limit', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();

        for (let i = 0; i < 7; i++) {
            await agent()
                .post('/api/auth/login')
                .send({ email: user.email, password: 'password' })
                .expect(200);
        }
    });

    it('issues a new session id on login (no session fixation)', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = agent();

        const first = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' });
        const second = await client
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' });

        const sid = (res: typeof first) =>
            res.headers['set-cookie']?.[0]?.split(';')[0];

        expect(sid(first)).toBeDefined();
        expect(sid(second)).toBeDefined();
        expect(sid(second)).not.toBe(sid(first));
    });

    it('sets a secure-by-default session cookie', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();

        const res = await agent()
            .post('/api/auth/login')
            .send({ email: user.email, password: 'password' });
        const cookie = res.headers['set-cookie']![0]!;

        expect(cookie).toMatch(/^hisaab_session=/);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('"remember me" keeps the session for 30 days, otherwise 2 hours', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();

        const expiresInDays = async (remember: boolean) => {
            const res = await agent()
                .post('/api/auth/login')
                .send({ email: user.email, password: 'password', remember });
            const expires =
                res.headers['set-cookie']![0]!.match(/Expires=([^;]+)/i)![1]!;
            return (new Date(expires).getTime() - Date.now()) / 86_400_000;
        };

        expect(await expiresInDays(true)).toBeCloseTo(30, 0);
        expect(await expiresInDays(false)).toBeCloseTo(2 / 24, 1);
    });

    it('drops the session of a deleted user', async () => {
        const { agent } = makeTestApp();
        const user = await createUser();
        const client = await loginAs(agent(), user);

        await User.deleteOne({ _id: user._id });

        expect((await client.get('/api/auth/me')).body.user).toBeNull();
    });
});

describe('guards and CSRF', () => {
    useTestDb();

    it('guests get 401 from protected endpoints', async () => {
        const { agent } = makeTestApp();

        await agent().patch('/api/settings/profile').send({}).expect(401);
        await agent().put('/api/settings/password').send({}).expect(401);
        await agent()
            .post('/api/auth/email/verification-notification')
            .expect(401);
    });

    it('unverified users cannot use verified-only endpoints', async () => {
        const { agent } = makeTestApp();
        const user = await createUser({ verified: false });
        const client = await loginAs(agent(), user);

        const res = await client
            .put('/api/settings/password')
            .send({
                current_password: 'password',
                password: 'new-password',
                password_confirmation: 'new-password',
            })
            .expect(403);

        expect(res.body.message).toBe('Your email address is not verified.');
    });

    it('rejects writes from another origin', async () => {
        const { app } = makeTestApp();
        const user = await createUser();

        await request(app)
            .post('/api/auth/login')
            .set('Origin', 'https://evil.example')
            .send({ email: user.email, password: 'password' })
            .expect(403);
    });

    it('rejects writes with no Origin unless the browser says same-origin', async () => {
        const { app } = makeTestApp();
        const user = await createUser();
        const body = { email: user.email, password: 'password' };

        await request(app).post('/api/auth/login').send(body).expect(403);
        await request(app)
            .post('/api/auth/login')
            .set('Sec-Fetch-Site', 'cross-site')
            .send(body)
            .expect(403);
        await request(app)
            .post('/api/auth/login')
            .set('Sec-Fetch-Site', 'same-origin')
            .send(body)
            .expect(200);
    });

    it('allows reads from anywhere', async () => {
        const { app } = makeTestApp();

        await request(app)
            .get('/api/auth/me')
            .set('Origin', 'https://evil.example')
            .expect(200);
    });

    it('me reports the password rules for the current env', async () => {
        const lax = await makeTestApp().agent().get('/api/auth/me');
        const strict = await makeTestApp({ strict: true })
            .agent()
            .get('/api/auth/me');

        expect(lax.body).toEqual({
            user: null,
            passwordRules: 'minlength: 8;',
        });
        expect(strict.body.passwordRules).toBe(
            'minlength: 12; required: lower; required: upper; required: digit; required: special;',
        );
        expect(lax.headers['cache-control']).toBe('no-store');
    });

    it('sanity: test app uses the expected origin', () => {
        expect(APP_URL).toBe('http://localhost:5173');
    });
});
