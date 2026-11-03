import { readFileSync } from 'node:fs';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { withJobLock } from '../../src/lib/jobLock.js';
import { createLogger } from '../../src/lib/logger.js';
import { Scheme } from '../../src/models/scheme.js';
import { useTestDb } from '../support/db.js';
import { APP_URL, TEST_SECRET } from '../support/app.js';

const CRON_SECRET = 'cron-secret-'.padEnd(40, 'y');
const fixture = readFileSync(
    new URL('../fixtures/amfi/NAVAll-sample.txt', import.meta.url),
    'utf8',
);

function makeApp(
    opts: { cronSecret?: string; body?: string; status?: number } = {},
) {
    const config = loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
        SESSION_SECRET: TEST_SECRET,
        APP_URL,
        ...(opts.cronSecret === undefined
            ? { CRON_SECRET }
            : { CRON_SECRET: opts.cronSecret }),
    });
    const fetch = vi.fn(
        async (_url: string | URL | Request) =>
            new Response(opts.body ?? fixture, { status: opts.status ?? 200 }),
    );
    const app = createApp({ config, logger: createLogger(config), fetch });

    return { app, fetch };
}

const post = (app: ReturnType<typeof makeApp>['app'], secret?: string) => {
    const req = request(app).post('/internal/jobs/nav-import');
    return secret === undefined ? req : req.set('X-Cron-Secret', secret);
};

describe('POST /internal/jobs/nav-import', () => {
    useTestDb();

    it('imports NAVs with the right secret', async () => {
        const { app, fetch } = makeApp();

        const res = await post(app, CRON_SECRET).expect(200);

        expect(res.body).toMatchObject({
            job: 'nav-import',
            fileDate: '2026-10-07',
            created: 11,
            skippedEtfs: 1,
        });
        expect(typeof res.body.ms).toBe('number');
        expect(fetch).toHaveBeenCalledOnce();
        expect(await Scheme.countDocuments()).toBe(11);
    });

    it('rejects a missing or wrong secret', async () => {
        const { app, fetch } = makeApp();

        await post(app).expect(401);
        await post(app, 'nope').expect(401);
        await post(app, `${CRON_SECRET}x`).expect(401);

        expect(fetch).not.toHaveBeenCalled();
    });

    it('is off when CRON_SECRET is not set', async () => {
        const { app, fetch } = makeApp({ cronSecret: '' });

        await post(app, '').expect(503);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('needs no Origin header or session', async () => {
        const { app } = makeApp();

        const res = await post(app, CRON_SECRET).expect(200);

        expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('answers 409 while an import is already running', async () => {
        const { app } = makeApp();

        await withJobLock('nav-import', 30, async () => {
            await post(app, CRON_SECRET).expect(409);
        });
    });

    it('answers 502 when AMFI serves something that is not a NAV file', async () => {
        const { app } = makeApp({ body: '<html>Maintenance</html>' });

        const res = await post(app, CRON_SECRET).expect(502);

        expect(res.body.message).toMatch(/header/);
    });

    it('only accepts POST, and unknown jobs are a JSON 404', async () => {
        const { app } = makeApp();

        await request(app)
            .get('/internal/jobs/nav-import')
            .set('X-Cron-Secret', CRON_SECRET)
            .expect(404);
        await request(app)
            .post('/internal/jobs/nope')
            .set('X-Cron-Secret', CRON_SECRET)
            .expect(404)
            .expect('Content-Type', /json/);
    });
});
