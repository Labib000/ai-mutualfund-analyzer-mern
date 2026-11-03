import { existsSync } from 'node:fs';
import path from 'node:path';

import express, { type Express } from 'express';
import helmet from 'helmet';

import type { AuthContext } from './auth/context.js';
import { type PasswordPolicy, hibpChecker } from './auth/password.js';
import { UrlSigner } from './auth/signedUrl.js';
import type { Config } from './config.js';
import type { Logger } from './lib/logger.js';
import { sessionMiddleware } from './lib/session.js';
import { type Mailer, createMailer } from './mail/mailer.js';
import { loadUser } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { requireSameOrigin } from './middleware/origin.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { settingsRouter } from './routes/settings.js';

export type AppOptions = {
    config: Config;
    logger: Logger;
    /** Directory with the built client; served with an SPA fallback when present. */
    clientDist?: string;
    /** Defaults to SMTP, or the mail log when SMTP isn't configured. */
    mailer?: Mailer;
    /** Defaults to Laravel's rules: strict (with HIBP) in production only. */
    passwordPolicy?: PasswordPolicy;
};

export function createApp(options: AppOptions): Express {
    const { config, logger, clientDist } = options;
    const app = express();

    const ctx: AuthContext = {
        config,
        logger,
        mailer: options.mailer ?? createMailer(config, logger),
        signer: new UrlSigner(config.SESSION_SECRET),
        passwordPolicy: options.passwordPolicy ?? {
            strict: config.NODE_ENV === 'production',
            pwned: hibpChecker,
        },
    };

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

    const api = express.Router();
    api.use(healthRouter); // no session needed

    api.use(requireSameOrigin(config.APP_URL));
    api.use(express.json({ limit: '100kb' }));
    api.use(sessionMiddleware(config));
    api.use(loadUser);

    api.use('/auth', authRouter(ctx));
    api.use('/settings', settingsRouter(ctx));
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
