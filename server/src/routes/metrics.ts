/**
 * Load-test metrics (see lib/metrics.ts), behind the cron secret:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/internal/metrics
 *   curl -X POST -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/internal/metrics/reset
 * and the Prometheus format, which Prometheus scrapes with a bearer token:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/internal/metrics/prometheus
 */
import { Router } from 'express';

import type { Config } from '../config.js';
import { metrics, promRegistry } from '../lib/metrics.js';
import { requireCronSecret } from '../middleware/cronSecret.js';
import { perIpLimiter } from '../middleware/rateLimits.js';

export function metricsRouter(config: Config): Router {
    const router = Router();

    // Generous: a load-test script may poll every second.
    router.use(perIpLimiter('metrics', 120));
    router.use(requireCronSecret(config.CRON_SECRET));

    router.get('/', (_req, res) => {
        res.set('Cache-Control', 'no-store').json(metrics.snapshot());
    });

    router.get('/prometheus', async (_req, res) => {
        res.set('Content-Type', promRegistry.contentType)
            .set('Cache-Control', 'no-store')
            .send(await promRegistry.metrics());
    });

    router.post('/reset', (_req, res) => {
        metrics.reset();
        res.json({ message: 'Metrics reset.' });
    });

    return router;
}
