import { shortSchemeName } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

describe('shortSchemeName', () => {
    it.each([
        [
            'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
            'Parag Parikh Flexi Cap Fund',
        ],
        [
            'UTI - Nifty Next 50 Index Fund - Direct Plan - Growth',
            'UTI Nifty Next 50 Index Fund',
        ],
        ['HDFC Liquid Fund - Direct Plan - Growth Option', 'HDFC Liquid Fund'],
        [
            "Axis Children's Fund - Direct Plan - Growth Option",
            "Axis Children's Fund",
        ],
        [
            'Aditya Birla Sun Life Frontline Equity Fund - Growth - Regular Plan',
            'Aditya Birla Sun Life Frontline Equity Fund',
        ],
        ['SBI Bluechip Fund - Regular Plan - IDCW Payout', 'SBI Bluechip Fund'],
        ['Quant Small Cap Fund', 'Quant Small Cap Fund'],
    ])('%s → %s', (name, short) => {
        expect(shortSchemeName(name)).toBe(short);
    });

    it('never empties a name', () => {
        expect(shortSchemeName('Growth Plan')).toBe('Growth Plan');
    });
});
