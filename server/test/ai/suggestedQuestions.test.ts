import { describe, expect, it } from 'vitest';

import {
    SUGGESTION_LIMIT,
    suggestedQuestions,
} from '../../src/ai/suggestedQuestions.js';
import type { Insight } from '../../src/portfolio/insights.js';

// Port of tests/Unit/Ai/SuggestedQuestionsTest.php
const insight = (code: string, title: string, question?: string): Insight =>
    ({ code, tone: 'info', title, detail: '', question }) as Insight;

describe('suggestedQuestions', () => {
    it('puts insight questions first and fills the rest with general ones', () => {
        expect(
            suggestedQuestions([
                insight(
                    'loss',
                    'A is below its cost',
                    'Why is A below its cost?',
                ),
                insight('idle', 'No new money'),
                insight(
                    'regular_plan',
                    'Regular',
                    'What is the difference between Direct and Regular plans?',
                ),
                insight(
                    'short_history',
                    'Short',
                    'Why is my XIRR not reliable yet?',
                ),
            ]),
        ).toEqual([
            'Why is A below its cost?',
            'What is the difference between Direct and Regular plans?',
            'How did my portfolio change in the last 30 days?',
            'Which of my funds has the best XIRR so far?',
        ]);
    });

    it('uses the general questions without insights', () => {
        expect(suggestedQuestions([])).toHaveLength(SUGGESTION_LIMIT);
        expect(suggestedQuestions([])).toContain(
            'How much have I invested in each financial year?',
        );
    });
});
