/** The AI features' API (Phase 4, port of Laravel's AiController). Answers are plain text. */

export const AI_QUESTION_MAX = 500;
export const AI_HISTORY_MAX_TURNS = 6;
export const AI_HISTORY_CONTENT_MAX = 2000;

export type AiTurn = { role: 'user' | 'assistant'; content: string };

/** Successful AI requests left this month; on every AI response, errors included. */
export type AiRemaining = { remaining: number };

/** GET /api/ai/ask */
export type AskPageResponse = AiRemaining & {
    hasFunds: boolean;
    /** Up to 4 starter questions, led by the portfolio's insights. */
    suggestions: string[];
};

/** POST /api/ai/ask */
export type AskRequest = { question: string; history?: AiTurn[] };
export type AskResponse = AiRemaining & { text: string };

/** POST /api/ai/summary and /api/ai/digest */
export type AiReportResponse = AiRemaining & {
    text: string;
    /** ISO timestamp. */
    generatedAt: string;
    /** Served from the cache, so no request was used. */
    cached: boolean;
};

/** POST /api/holdings/:id/explain */
export type ExplainFundResponse = AiRemaining & {
    text: string;
    cached: boolean;
};

/** Error body of the AI endpoints (422, 429, 503). */
export type AiErrorBody = AiRemaining & { message: string };
