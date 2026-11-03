/**
 * Endpoints hPanel cron calls, e.g.
 *   curl -fsS -X POST -H "X-Cron-Secret: …" https://…/internal/jobs/nav-import
 * They sit outside /api: no session, no Origin check (cron sends none).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { type RequestHandler, Router } from 'express';

import type { Config } from '../config.js';
import { JobLockedError } from '../lib/jobLock.js';
import type { Logger } from '../lib/logger.js';
import { AmfiDownloadError, runNavImport } from '../jobs/navImport.js';
import { runSipsGenerate } from '../jobs/sipsGenerate.js';
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

const digest = (value: string) => createHash('sha256').update(value).digest();

function requireCronSecret(secret: string | undefined): RequestHandler {
    const expected = secret ? digest(secret) : null;

    return (req, res, next) => {
        if (!expected) {
            res.status(503).json({ message: 'Cron jobs are not configured.' });
            return;
        }

        const given = req.get('x-cron-secret') ?? '';

        if (!timingSafeEqual(digest(given), expected)) {
            res.status(401).json({ message: 'Invalid cron secret.' });
            return;
        }

        next();
    };
}

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
