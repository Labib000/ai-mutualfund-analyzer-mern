import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';
import { loadConfig } from '../../../src/config.js';
import { withJobLock } from '../../../src/lib/jobLock.js';
import { createLogger } from '../../../src/lib/logger.js';
import { Transaction } from '../../../src/models/transaction.js';
import { APP_URL, TEST_SECRET } from '../../support/app.js';
import { useTestDb } from '../../support/db.js';
import { usePortfolio } from '../../support/portfolio.js';

const CRON_SECRET = 'cron-secret-'.padEnd(40, 'y');

describe('POST /internal/jobs/sips-generate', () => {
    useTestDb();
    const p = usePortfolio();

    const cronApp = () => {
        const config = loadConfig({
            NODE_ENV: 'test',
            MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
            SESSION_SECRET: TEST_SECRET,
            APP_URL,
            CRON_SECRET,
        });
        return createApp({
            config,
            logger: createLogger(config),
            navProvider: p().navProvider,
        });
    };

    it('records installments whose NAV is now published', async () => {
        await p()
            .agent.post(p().url('/sips'))
            .send({ amount: '1000', day_of_month: 8, start_date: '2026-09-01' })
            .expect(201);
        await p().publishNav('2026-10-08', '29.5000');

        const res = await request(cronApp())
            .post('/internal/jobs/sips-generate')
            .set('X-Cron-Secret', CRON_SECRET)
            .expect(200);

        expect(res.body).toMatchObject({
            job: 'sips-generate',
            created: 1,
            failed: 0,
        });
        expect(await Transaction.countDocuments()).toBe(2);
    });

    it('needs the cron secret', async () => {
        await request(cronApp())
            .post('/internal/jobs/sips-generate')
            .expect(401);
    });

    it('answers 409 while a run is in progress', async () => {
        await withJobLock('sips-generate', 30, async () => {
            await request(cronApp())
                .post('/internal/jobs/sips-generate')
                .set('X-Cron-Secret', CRON_SECRET)
                .expect(409);
        });
    });
});
