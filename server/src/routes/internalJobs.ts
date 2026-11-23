/**
 * Endpoints hPanel cron calls, e.g.
 *   curl -fsS -X POST -H "X-Cron-Secret: …" https://…/internal/jobs/nav-import
 * They sit outside /api: no session, no Origin check (cron sends none).
 */
import { Router } from 'express';

import type { Config } from '../config.js';
import { JobLockedError } from '../lib/jobLock.js';
import type { Logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import { AmfiDownloadError, runNavImport } from '../jobs/navImport.js';
import { runSipsGenerate } from '../jobs/sipsGenerate.js';
import { requireCronSecret } from '../middleware/cronSecret.js';
import { perIpLimiter } from '../middleware/rateLimits.js';
import { AmfiNavFileError } from '../nav/amfiNavFileParser.js';
import type { NavLookup } from '../nav/navLookup.js';

export type InternalJobsContext = {
    config: Config;
    logger: Logger;
    /** Outbound HTTP (AMFI download); tests pass a fake. */
    fetch?: typeof fetch;
    navs: NavLookup;
};

export function internalJobsRouter(ctx: InternalJobsContext): Router {
    const router = Router();

    router.use(perIpLimiter('cron', 10));
    router.use(requireCronSecret(ctx.config.CRON_SECRET));

    router.post('/nav-import', async (_req, res) => {
        const started = Date.now();

        try {
            const result = await runNavImport({
                config: ctx.config,
                fetch: ctx.fetch,
            });
            const ms = Date.now() - started;

            metrics.recordJob('nav-import', ms, true, result);
            ctx.logger.info(
                { job: 'nav-import', ...result, ms },
                'job finished',
            );
            res.json({ job: 'nav-import', ...result, ms });
        } catch (error) {
            if (error instanceof JobLockedError) {
                res.status(409).json({ message: error.message });
                return;
            }

            if (
                error instanceof AmfiDownloadError ||
                error instanceof AmfiNavFileError
            ) {
                metrics.recordJob('nav-import', Date.now() - started, false);
                ctx.logger.error(
                    { job: 'nav-import', err: error.message },
                    'job failed',
                );
                res.status(502).json({ message: error.message });
                return;
            }

            throw error;
        }
    });

    router.post('/sips-generate', async (_req, res) => {
        const started = Date.now();

        try {
            const result = await runSipsGenerate({
                navs: ctx.navs,
                logger: ctx.logger,
            });
            const ms = Date.now() - started;

            metrics.recordJob('sips-generate', ms, result.failed === 0, result);
            ctx.logger.info(
                { job: 'sips-generate', ...result, ms },
                'job finished',
            );
            res.json({ job: 'sips-generate', ...result, ms });
        } catch (error) {
            if (error instanceof JobLockedError) {
                res.status(409).json({ message: error.message });
                return;
            }
            throw error;
        }
    });

    return router;
}
