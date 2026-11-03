import type { SchemeSearchResponse } from '@hisaab/shared';
import { Router } from 'express';

import { requireAuth, requireVerified } from '../middleware/auth.js';
import { Holding } from '../models/holding.js';
import { Scheme } from '../models/scheme.js';
import { schemeSummary } from '../portfolio/presenters.js';

const SEARCH_LIMIT = 20;
const MAX_WORDS = 6;
const MAX_QUERY_LENGTH = 100;

const escapeRegex = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Scheme search for adding a fund (HoldingController::create/search). */
export function schemesRouter(): Router {
    const router = Router();

    router.use(requireAuth, requireVerified);

    /** Active schemes whose name contains every word of the query, in any order. */
    router.get('/', async (req, res) => {
        const raw = typeof req.query.q === 'string' ? req.query.q : '';
        const query = raw.slice(0, MAX_QUERY_LENGTH).trim();

        if (query.length < 2) {
            res.json({ query, results: [] } satisfies SchemeSearchResponse);
            return;
        }

        const words = query.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);

        const [schemes, held] = await Promise.all([
            Scheme.find({
                isActive: true,
                latestNav: { $ne: null },
                $and: words.map((word) => ({
                    name: { $regex: escapeRegex(word), $options: 'i' },
                })),
            })
                .collation({ locale: 'en' })
                .sort({ name: 1 })
                .limit(SEARCH_LIMIT)
                .lean(),
            Holding.find({ userId: req.user!._id }, { schemeId: 1 }).lean(),
        ]);

        const holdingOf = new Map(
            held.map((h) => [String(h.schemeId), String(h._id)]),
        );

        res.json({
            query,
            results: schemes.map((scheme) => ({
                ...schemeSummary(scheme),
                isHeld: holdingOf.has(String(scheme._id)),
                holdingId: holdingOf.get(String(scheme._id)) ?? null,
            })),
        } satisfies SchemeSearchResponse);
    });

    return router;
}
