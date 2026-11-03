import request from 'supertest';
import { vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/lib/logger.js';
import { FakeMailer } from '../../src/mail/mailer.js';
import { User, type UserDoc } from '../../src/models/user.js';

export const APP_URL = 'http://localhost:5173';
export const TEST_SECRET = 'test-secret-'.padEnd(48, 'x');

export function testConfig() {
    return loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
        SESSION_SECRET: TEST_SECRET,
        APP_URL,
    });
}

/**
 * A test app with a fake mailer and a stubbed breached-password check.
 * `strict` turns on Laravel's production password rules.
 */
export function makeTestApp(opts: { strict?: boolean } = {}) {
    const config = testConfig();
    const mailer = new FakeMailer();
    const pwned = vi.fn(async (_password: string) => false);

    const app = createApp({
        config,
        logger: createLogger(config),
        mailer,
        passwordPolicy: { strict: opts.strict ?? false, pwned },
    });

    /** A cookie-keeping client that sends our Origin, like the browser. */
    const agent = () => request.agent(app).set('Origin', APP_URL);

    return { app, config, mailer, pwned, agent };
}

let counter = 0;

/** Like Laravel's User::factory(): verified, password "password". */
export async function createUser(
    overrides: {
        name?: string;
        email?: string;
        password?: string;
        verified?: boolean;
    } = {},
): Promise<UserDoc> {
    counter += 1;

    return User.create({
        name: overrides.name ?? `Test User ${counter}`,
        email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
        passwordHash: await hashPassword(overrides.password ?? 'password'),
        emailVerifiedAt: overrides.verified === false ? null : new Date(),
    });
}

export type Agent = ReturnType<ReturnType<typeof makeTestApp>['agent']>;

export async function loginAs(
    agent: Agent,
    user: UserDoc,
    password = 'password',
) {
    await agent
        .post('/api/auth/login')
        .send({ email: user.email, password })
        .expect(200);
    return agent;
}

/** Pulls the first http(s) link out of an email's text. */
export function linkFrom(text: string): string {
    const match = text.match(/https?:\/\/\S+/);
    if (!match) throw new Error(`no link in email:\n${text}`);
    return match[0];
}

/** Path + query of an absolute URL (what supertest requests). */
export const pathOf = (url: string) => {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
};
