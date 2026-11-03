import type { HealthResponse } from '@hisaab/shared';
import { Router } from 'express';

import { pingDb } from '../db.js';
import { now, today } from '../lib/today.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res) => {
    const dbUp = await pingDb();

    const body: HealthResponse = {
        status: dbUp ? 'ok' : 'degraded',
        db: dbUp ? 'up' : 'down',
        today: today(),
        time: now().toISOString(),
    };

    res.status(dbUp ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json(body);
});
