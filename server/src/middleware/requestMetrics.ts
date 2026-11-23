import type { RequestHandler } from 'express';

import { metrics, routeLabel } from '../lib/metrics.js';

/**
 * Records each request's latency, status and Mongo usage (see lib/metrics.ts).
 * The metrics endpoints themselves aren't recorded, so polling them during a
 * load test doesn't change the numbers.
 */
export function requestMetrics(): RequestHandler {
    return (req, res, next) => {
        if (req.path.startsWith('/internal/metrics')) {
            next();
            return;
        }

        const start = process.hrtime.bigint();

        metrics.runInRequest((scope) => {
            res.on('finish', () => {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                metrics.recordRequest(
                    routeLabel(req.method, req.originalUrl),
                    res.statusCode,
                    ms,
                    scope,
                );
            });

            next();
        });
    };
}
