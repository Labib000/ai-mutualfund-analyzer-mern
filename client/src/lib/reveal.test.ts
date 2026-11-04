import { describe, expect, it } from 'vitest';

import { revealCount, revealDuration, revealTokens } from './reveal';

describe('reveal', () => {
    it('keeps spaces and line breaks with each word, so any prefix reads naturally', () => {
        const tokens = revealTokens(
            'Your XIRR is +9.07%.\n\n- One fund\n- Two',
        );
        expect(tokens.join('')).toBe(
            'Your XIRR is +9.07%.\n\n- One fund\n- Two',
        );
        expect(tokens.slice(0, 4).join('')).toBe('Your XIRR is +9.07%.\n\n');
    });

    it('takes about 18 ms a word, capped at 1.6 s', () => {
        expect(revealDuration(10)).toBe(180);
        expect(revealDuration(300)).toBe(1600);
    });

    it('counts words shown over time, ending with all of them', () => {
        expect(revealCount(100, 0)).toBe(0);
        expect(revealCount(100, 800)).toBe(50);
        expect(revealCount(100, 5000)).toBe(100);
        expect(revealCount(0, 0)).toBe(0);
    });
});
