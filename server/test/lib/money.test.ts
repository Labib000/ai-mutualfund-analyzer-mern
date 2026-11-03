import { formatInr, isRupeeAmount, rupeesToPaise } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

// Port of tests/Unit/Support/MoneyTest.php
describe('rupeesToPaise', () => {
    it.each([
        ['whole rupees', '10000', 1000000],
        ['one decimal', '499.5', 49950],
        ['two decimals', '0.01', 1],
        ['indian grouping', '1,00,000.25', 10000025],
        ['surrounding spaces', ' 250 ', 25000],
        ['zero', '0', 0],
    ])('%s', (_name, rupees, paise) => {
        expect(rupeesToPaise(rupees)).toBe(paise);
        expect(isRupeeAmount(rupees)).toBe(true);
    });

    it.each([
        ['three decimals', '1.005'],
        ['negative', '-5'],
        ['text', 'ten'],
        ['empty', ''],
        ['exponent', '1e5'],
        ['bare decimal point', '.5'],
    ])('rejects %s', (_name, rupees) => {
        expect(isRupeeAmount(rupees)).toBe(false);
        expect(() => rupeesToPaise(rupees)).toThrow(RangeError);
    });

    it('rejects amounts beyond the safe integer range', () => {
        expect(() => rupeesToPaise('999999999999999999999')).toThrow(
            RangeError,
        );
    });
});

describe('formatInr', () => {
    it('uses Indian grouping', () => {
        expect(formatInr(5)).toBe('₹0.05');
        expect(formatInr(99900)).toBe('₹999.00');
        expect(formatInr(100000)).toBe('₹1,000.00');
        expect(formatInr(1234567)).toBe('₹12,345.67');
        expect(formatInr(10000000)).toBe('₹1,00,000.00');
        expect(formatInr(123456789_00)).toBe('₹12,34,56,789.00');
        expect(formatInr(-11608)).toBe('−₹116.08');
        expect(formatInr(68204, true)).toBe('+₹682.04');
        expect(formatInr(0, true)).toBe('₹0.00');
    });
});
