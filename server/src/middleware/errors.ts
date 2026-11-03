import type { ErrorRequestHandler, RequestHandler } from 'express';

import type { Logger } from '../lib/logger.js';

/** JSON 404 for unknown /api routes (never the SPA's index.html). */
export const apiNotFound: RequestHandler = (_req, res) => {
    res.status(404).json({ message: 'Not found.' });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
    return (err, req, res, next) => {
        if (res.headersSent) {
            next(err);
            return;
        }

        // body-parser errors (malformed JSON, payload too large) carry a status.
        const status =
            typeof err?.status === 'number' &&
            err.status >= 400 &&
            err.status < 500
                ? err.status
                : 500;

        if (status === 500) {
            logger.error(
                { err, method: req.method, url: req.originalUrl },
                'unhandled error',
            );
        }

        res.status(status).json({
            message:
                status === 500
                    ? 'Something went wrong.'
                    : (err.message ?? 'Bad request.'),
        });
    };
}
