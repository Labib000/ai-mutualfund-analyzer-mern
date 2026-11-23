import { createHash, timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Guards /internal/*: the X-Cron-Secret header must match CRON_SECRET.
 * `Authorization: Bearer <CRON_SECRET>` works too, which is what Prometheus sends.
 * Answers 503 when CRON_SECRET is unset, so the endpoints are off by default.
 */
export function requireCronSecret(secret: string | undefined): RequestHandler {
    const expected = secret ? digest(secret) : null;

    return (req, res, next) => {
        if (!expected) {
            res.status(503).json({ message: 'Cron jobs are not configured.' });
            return;
        }

        const bearer = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
        const given = req.get('x-cron-secret') ?? bearer?.[1] ?? '';

        if (!timingSafeEqual(digest(given), expected)) {
            res.status(401).json({ message: 'Invalid cron secret.' });
            return;
        }

        next();
    };
}
