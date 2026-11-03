import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for the cookie session: state-changing requests must come from
 * our own origin. Works with SameSite=Lax cookies as a second layer.
 */
export function requireSameOrigin(appUrl: string): RequestHandler {
    const allowed = new URL(appUrl).origin;

    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method)) {
            next();
            return;
        }

        const origin = req.get('origin');
        const fetchSite = req.get('sec-fetch-site');

        const ok = origin ? origin === allowed : fetchSite === 'same-origin';

        if (!ok) {
            res.status(403).json({ message: 'Invalid request origin.' });
            return;
        }

        next();
    };
}
