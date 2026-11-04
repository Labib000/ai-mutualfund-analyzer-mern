/**
 * The AI features' JSON endpoints (port of AiController). Every failure
 * becomes a friendly message with the requests left this month.
 */
import {
    AI_HISTORY_CONTENT_MAX,
    AI_HISTORY_MAX_TURNS,
    AI_QUESTION_MAX,
    type AiErrorBody,
    type AiReportResponse,
    type AskPageResponse,
    type AskResponse,
    CHANGE_PERIODS,
    type ExplainFundResponse,
} from '@hisaab/shared';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

import {
    askPortfolio,
    digestPortfolio,
    explainFund,
    summarisePortfolio,
} from '../ai/actions.js';
import type { AiContext } from '../ai/aiContext.js';
import { suggestedQuestions } from '../ai/suggestedQuestions.js';
import { AiQuotaExceededError, AiUnavailableError } from '../ai/provider.js';
import { today } from '../lib/today.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { sendValidationErrors } from '../middleware/validate.js';
import { Scheme } from '../models/scheme.js';
import { portfolioInsights } from '../portfolio/insights.js';
import { performanceForUser } from '../portfolio/portfolioPerformance.js';

const NO_FUNDS =
    'Add a fund and some transactions first, then the AI can explain your portfolio.';
const NO_CHANGE =
    'There is no change to explain yet. Check back once your funds have NAVs for this period.';
const UNAVAILABLE =
    'The AI assistant is busy or unavailable right now. Please try again in a minute.';

const askSchema = z.object({
    question: z
        .string({ error: 'Please type a question.' })
        .trim()
        .min(1, 'Please type a question.')
        .max(
            AI_QUESTION_MAX,
            `Questions can be up to ${AI_QUESTION_MAX} characters.`,
        ),
    history: z
        .array(
            z.object({
                role: z.enum(['user', 'assistant'], {
                    error: 'The conversation history is invalid.',
                }),
                content: z
                    .string({ error: 'The conversation history is invalid.' })
                    .max(
                        AI_HISTORY_CONTENT_MAX,
                        'An earlier message is too long.',
                    ),
            }),
            { error: 'The conversation history is invalid.' },
        )
        .max(
            AI_HISTORY_MAX_TURNS,
            `Only the last ${AI_HISTORY_MAX_TURNS} messages can be sent.`,
        )
        .default([]),
});

const summarySchema = z.object({
    fresh: z.boolean().optional().default(false),
});
const digestSchema = z.object({
    period: z.enum(CHANGE_PERIODS, {
        error: 'Choose 7 days, 30 days or this month.',
    }),
});

/** Parses or sends a 422 keyed by the full path ("history.0.role"), as Laravel names nested fields. */
function parse<S extends z.ZodType>(
    schema: S,
    req: Request,
    res: Response,
): z.output<S> | undefined {
    const result = schema.safeParse(req.body ?? {});
    if (result.success) return result.data;

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues)
        errors[issue.path.join('.') || 'form'] ??= issue.message;
    sendValidationErrors(res, errors);
    return undefined;
}

/**
 * Runs an AI action: quota and provider failures become 429 and 503, and
 * every answer carries the requests left this month.
 */
export function aiResponder(ai: AiContext) {
    const remaining = (req: Request) => ai.quota.remaining(req.user!._id);
    const fail = async (
        req: Request,
        res: Response,
        status: number,
        message: string,
    ) => {
        res.status(status).json({
            message,
            remaining: await remaining(req),
        } satisfies AiErrorBody);
    };

    return async <T extends object>(
        req: Request,
        res: Response,
        action: () => Promise<T | null>,
        emptyMessage = NO_FUNDS,
    ): Promise<void> => {
        let result: T | null;
        try {
            result = await action();
        } catch (error) {
            if (error instanceof AiQuotaExceededError)
                return fail(req, res, 429, error.message);
            if (error instanceof AiUnavailableError)
                return fail(req, res, 503, UNAVAILABLE);
            throw error;
        }
        if (result === null) return fail(req, res, 422, emptyMessage);
        res.json({ ...result, remaining: await remaining(req) });
    };
}

export function aiRouter(ai: AiContext): Router {
    const router = Router();
    const respond = aiResponder(ai);
    router.use(requireAuth, requireVerified);

    /** What the Ask page needs: whether there's anything to ask about, requests left and starter questions. */
    router.get('/ask', async (req, res) => {
        const userId = req.user!._id;
        const { holdings, total } = await performanceForUser(userId);
        const insights =
            holdings.length === 0
                ? []
                : await portfolioInsights(holdings, total.xirrStatus, today());

        res.json({
            hasFunds: holdings.length > 0,
            remaining: await ai.quota.remaining(userId),
            suggestions: suggestedQuestions(insights),
        } satisfies AskPageResponse);
    });

    const limited = aiLimiter();

    router.post('/summary', limited, async (req, res) => {
        const input = parse(summarySchema, req, res);
        if (!input) return;
        await respond<Omit<AiReportResponse, 'remaining'>>(req, res, () =>
            summarisePortfolio(ai, req.user!._id, input.fresh),
        );
    });

    router.post('/ask', limited, async (req, res) => {
        const input = parse(askSchema, req, res);
        if (!input) return;
        await respond<Omit<AskResponse, 'remaining'>>(req, res, async () => {
            const text = await askPortfolio(
                ai,
                req.user!._id,
                input.question,
                input.history,
            );
            return text === null ? null : { text };
        });
    });

    router.post('/digest', limited, async (req, res) => {
        const input = parse(digestSchema, req, res);
        if (!input) return;
        await respond<Omit<AiReportResponse, 'remaining'>>(
            req,
            res,
            () => digestPortfolio(ai, req.user!._id, input.period),
            NO_CHANGE,
        );
    });

    return router;
}

/** POST /api/holdings/:holdingId/explain, mounted behind loadHolding (owner only). */
export function explainHandler(ai: AiContext) {
    const respond = aiResponder(ai);
    return [
        aiLimiter(),
        async (req: Request, res: Response) => {
            await respond<Omit<ExplainFundResponse, 'remaining'>>(
                req,
                res,
                async () => {
                    const scheme = await Scheme.findById(
                        req.holding!.schemeId,
                    ).lean();
                    if (!scheme)
                        throw new Error(
                            `Scheme ${String(req.holding!.schemeId)} is missing`,
                        );
                    return explainFund(ai, req.user!._id, scheme);
                },
            );
        },
    ];
}
