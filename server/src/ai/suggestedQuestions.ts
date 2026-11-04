/**
 * Starter questions for the Ask page, led by the portfolio's own insights.
 * Built without AI, so they cost nothing (port of App\Ai\SuggestedQuestions).
 */
import type { Insight } from '../portfolio/insights.js';

export const SUGGESTION_LIMIT = 4;

const GENERAL = [
    'How did my portfolio change in the last 30 days?',
    'Which of my funds has the best XIRR so far?',
    'How much have I invested in each financial year?',
    'How is my money split across asset classes?',
];

const unique = (list: string[]) => [...new Set(list)];

export function suggestedQuestions(insights: readonly Insight[]): string[] {
    const fromInsights = unique(
        insights.flatMap((i) => (i.question ? [i.question] : [])),
    );
    // At most two from insights, so the general ones still show.
    return unique([...fromInsights.slice(0, 2), ...GENERAL]).slice(
        0,
        SUGGESTION_LIMIT,
    );
}
