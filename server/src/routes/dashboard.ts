/** Portfolio overview (port of DashboardController). */
import type { DashboardResponse } from '@hisaab/shared';
import { Router } from 'express';

import { requireAuth, requireVerified } from '../middleware/auth.js';
import { today } from '../lib/today.js';
import { allocationOf } from '../portfolio/allocation.js';
import { insightJson, portfolioInsights } from '../portfolio/insights.js';
import {
    performanceForUser,
    portfolioChanges,
    portfolioHistory,
} from '../portfolio/portfolioPerformance.js';
import { schemeSummary } from '../portfolio/presenters.js';

const TOP_HOLDINGS = 5;

export function dashboardRouter(): Router {
    const router = Router();
    router.use(requireAuth, requireVerified);

    router.get('/', async (req, res) => {
        const userId = req.user!._id;
        const { holdings, total } = await performanceForUser(userId);

        const byValue = [...holdings].sort(
            (a, b) => b.performance.valuePaise - a.performance.valuePaise,
        );

        res.json({
            fundCount: holdings.length,
            summary: total.toJSON(),
            history: await portfolioHistory(userId, holdings),
            changes: await portfolioChanges(holdings),
            insights: (
                await portfolioInsights(holdings, total.xirrStatus, today())
            ).map(insightJson),
            allocation: allocationOf(
                holdings.map((h) => ({
                    category: h.scheme.category,
                    valuePaise: h.performance.valuePaise,
                })),
            ),
            topHoldings: byValue.slice(0, TOP_HOLDINGS).map((h) => ({
                id: String(h.holdingId),
                scheme: schemeSummary(h.scheme),
                performance: h.performance.toJSON(),
            })),
        } satisfies DashboardResponse);
    });

    return router;
}
