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
import { MfApiNavProvider } from './nav/mfApiNavProvider.js';
import { NavLookup } from './nav/navLookup.js';
import { createAiContext } from './ai/aiContext.js';
import type { AiProvider } from './ai/provider.js';
import type { NavProvider } from './nav/navProvider.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { dashboardRouter } from './routes/dashboard.js';
import { holdingsRouter } from './routes/holdings.js';
import { aiRouter } from './routes/ai.js';
import { compareRouter } from './routes/compare.js';
import { internalJobsRouter } from './routes/internalJobs.js';
import { schemesRouter } from './routes/schemes.js';
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
    /** Outbound HTTP for jobs (AMFI download); tests pass a fake. */
    fetch?: typeof fetch;
    /** Historical NAVs; defaults to mfapi.in. Tests pass a FakeNavProvider. */
    navProvider?: NavProvider;
    /** The AI model; defaults to Groq. Tests pass a FakeAiProvider. */
    aiProvider?: AiProvider;
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

    const navs = new NavLookup(
        options.navProvider ??
            new MfApiNavProvider({
                baseUrl: config.MFAPI_BASE_URL,
                timeoutSeconds: config.MFAPI_TIMEOUT_SECONDS,
            }),
        logger,
    );
    const portfolio = { navs, logger };
    const ai = createAiContext(options);

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
    api.use('/schemes', schemesRouter());
    api.use('/holdings', holdingsRouter(portfolio, ai));
    api.use('/ai', aiRouter(ai));
    api.use('/dashboard', dashboardRouter());
    api.use('/compare', compareRouter(portfolio, config));
    api.use(apiNotFound);
    app.use('/api', api);

    const internal = express.Router();
    internal.use(
        '/jobs',
        internalJobsRouter({ config, logger, fetch: options.fetch, navs }),
    );
    internal.use(apiNotFound);
    app.use('/internal', internal);

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
