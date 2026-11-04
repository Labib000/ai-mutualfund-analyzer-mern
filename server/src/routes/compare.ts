/** The fund compare tool: up to three schemes side by side. Not in Laravel. */
import {
    COMPARE_MAX_FUNDS,
    type ApiErrorBody,
    type CompareResponse,
} from '@hisaab/shared';
import { Router } from 'express';
import { z } from 'zod';

import type { Config } from '../config.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { perUserLimiter } from '../middleware/rateLimits.js';
import { parseOr422, sendValidationErrors } from '../middleware/validate.js';
import { Holding } from '../models/holding.js';
import { Scheme } from '../models/scheme.js';
import { NavProviderError } from '../nav/navProvider.js';
import { schemeCompare } from '../nav/schemeCompare.js';
import type { PortfolioContext } from '../portfolio/actions/context.js';
import { schemeSummary } from '../portfolio/presenters.js';

const CHOOSE = `Choose between 1 and ${COMPARE_MAX_FUNDS} funds to compare.`;

const querySchema = z.object({
    ids: z
        .string({ error: CHOOSE })
        .transform((value) => value.split(',').filter(Boolean))
        .pipe(
            z
                .array(z.string().regex(/^[a-f0-9]{24}$/, CHOOSE))
                .min(1, CHOOSE)
                .max(COMPARE_MAX_FUNDS, CHOOSE)
                .refine(
                    (ids) => new Set(ids).size === ids.length,
                    'Each fund can only be compared once.',
                ),
        ),
});

export function compareRouter(ctx: PortfolioContext, config: Config): Router {
    const router = Router();
    router.use(requireAuth, requireVerified);

    // A first compare of a fund fetches its whole NAV history from mfapi.
    router.get('/', perUserLimiter('compare', 30), async (req, res) => {
        const query = parseOr422(querySchema, req.query, res);
        if (!query) return;

        const found = await Scheme.find({
            _id: { $in: query.ids },
            isActive: true,
        });
        if (found.length !== query.ids.length) {
            sendValidationErrors(res, {
                ids: 'One of these funds is no longer available.',
            });
            return;
        }
        // Keep the order asked for: it sets each fund's colour.
        const schemes = query.ids.map((id) =>
            found.find((s) => String(s._id) === id)!,
        );

        const results = await Promise.allSettled(
            schemes.map((scheme) => ctx.navs.ensureHistory(scheme)),
        );
        const failed = results.findIndex((r) => r.status === 'rejected');
        if (failed !== -1) {
            const reason = (results[failed] as PromiseRejectedResult).reason;
            if (!(reason instanceof NavProviderError)) throw reason;
            ctx.logger.warn(
                { schemeId: String(schemes[failed]!._id), err: reason },
                'compare: NAV history fetch failed',
            );
            const body: ApiErrorBody = {
                message: `Couldn't load the NAV history for ${schemes[failed]!.name}. Please try again.`,
            };
            res.status(503).json(body);
            return;
        }

        const holdings = await Holding.find(
            { userId: req.user!._id, schemeId: { $in: query.ids } },
            { schemeId: 1 },
        ).lean();
        const holdingOf = new Map(
            holdings.map((h) => [String(h.schemeId), String(h._id)]),
        );

        const body: CompareResponse = {
            funds: await Promise.all(
                schemes.map(async (scheme) => ({
                    scheme: schemeSummary(scheme),
                    holdingId: holdingOf.get(String(scheme._id)) ?? null,
                    stats: await schemeCompare(
                        scheme,
                        config.COMPARE_RISK_FREE_RATE,
                    ),
                })),
            ),
            riskFreeRatePct: config.COMPARE_RISK_FREE_RATE,
        };
        res.json(body);
    });

    return router;
}
