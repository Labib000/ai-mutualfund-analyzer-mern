import { describe, expect, it } from 'vitest';

import { toBlocks } from './ai-text';

describe('toBlocks', () => {
    it('splits paragraphs on blank lines and joins wrapped lines', () => {
        expect(toBlocks('First line\ncontinues.\n\nSecond.')).toEqual([
            { type: 'paragraph', text: 'First line continues.' },
            { type: 'paragraph', text: 'Second.' },
        ]);
    });

    it('groups "- ", "•" and numbered lines into one list, even across blank lines', () => {
        expect(
            toBlocks('Intro:\n- One\n\n- Two\n• Three\n4. Four\nAfter.'),
        ).toEqual([
            { type: 'paragraph', text: 'Intro:' },
            { type: 'list', items: ['One', 'Two', 'Three', 'Four'] },
            { type: 'paragraph', text: 'After.' },
        ]);
    });

    it('drops markdown emphasis and never treats text as HTML', () => {
        expect(toBlocks('- **XIRR** is __+9.07%__\n<b>hi</b>')).toEqual([
            { type: 'list', items: ['XIRR is +9.07%'] },
            { type: 'paragraph', text: '<b>hi</b>' },
        ]);
    });

    it('keeps a minus sign that is not a bullet', () => {
        expect(toBlocks('-₹500 this week')).toEqual([
            { type: 'paragraph', text: '-₹500 this week' },
        ]);
    });
});
