import { existsSync } from 'node:fs';
import path from 'node:path';

import express, { type Express } from 'express';
import helmet from 'helmet';

import type { Config } from './config.js';
import type { Logger } from './lib/logger.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';

export type AppOptions = {
    config: Config;
    logger: Logger;
    /** Directory with the built client; served with an SPA fallback when present. */
    clientDist?: string;
};

export function createApp({ config, logger, clientDist }: AppOptions): Express {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1); // Hostinger runs the app behind a proxy.

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    // Only upgrade to https when the app is served over https,
                    // so `npm start` on http://localhost still works.
                    upgradeInsecureRequests: config.APP_URL.startsWith(
                        'https://',
                    )
                        ? []
                        : null,
                },
            },
        }),
    );
    app.use(requestLogger(logger));
    app.use(express.json({ limit: '100kb' }));

    const api = express.Router();
    api.use(healthRouter);
    api.use(apiNotFound);
    app.use('/api', api);

    if (
        config.NODE_ENV === 'production' &&
        clientDist &&
        existsSync(clientDist)
    ) {
        const indexHtml = path.join(clientDist, 'index.html');

        // Hashed assets are immutable; everything else revalidates.
        app.use(
            '/assets',
            express.static(path.join(clientDist, 'assets'), {
                immutable: true,
                maxAge: '1y',
                fallthrough: false,
            }),
        );
        app.use(express.static(clientDist, { index: false, maxAge: '1h' }));

        app.get('/{*splat}', (_req, res) => {
            res.set('Cache-Control', 'no-cache').sendFile(indexHtml);
        });
    }

    app.use(errorHandler(logger));

    return app;
}
