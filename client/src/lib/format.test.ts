import { describe, expect, it } from 'vitest';

import {
    formatCompactPaise,
    formatDate,
    formatNav,
    formatPaise,
    formatPercent,
    formatRupees,
    formatSignedPaise,
    formatUnits,
    ordinal,
    paiseToRupeeInput,
} from './format';

describe('format helpers', () => {
    it('formats paise as rupees with Indian grouping', () => {
        expect(formatPaise(1000050)).toBe('₹10,000.50');
        expect(formatPaise(123456789_00)).toBe('₹12,34,56,789.00');
        expect(formatSignedPaise(123450)).toBe('+₹1,234.50');
        expect(formatSignedPaise(-5000)).toBe('−₹50.00');
        expect(formatSignedPaise(0)).toBe('₹0.00');
    });

    it('formats whole rupees and compact amounts', () => {
        expect(formatRupees(1161695.4)).toBe('₹11,61,695');
        expect(formatCompactPaise(21_40_000_00)).toBe('₹21.4L');
        expect(formatCompactPaise(1_25_00_000_00)).toBe('₹1.3Cr');
    });

    it('formats percentages', () => {
        expect(formatPercent(12.345)).toBe('12.35%');
        expect(formatPercent(12.3, { signed: true })).toBe('+12.30%');
        expect(formatPercent(-4.5, { signed: true })).toBe('−4.50%');
    });

    it('turns paise into a plain rupee input value', () => {
        expect(paiseToRupeeInput(500000)).toBe('5000');
        expect(paiseToRupeeInput(500005)).toBe('5000.05');
    });

    it('formats dates, NAVs and units without floats', () => {
        expect(formatDate('2026-10-05')).toBe('5 Oct 2026');
        expect(formatNav('1234567.8900')).toBe('₹12,34,567.8900');
        expect(formatUnits('6242.899')).toBe('6,242.899');
        expect(formatUnits('-100.000')).toBe('-100.000');
    });

    it('writes ordinals', () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual([
            '1st',
            '2nd',
            '3rd',
            '4th',
            '11th',
            '12th',
            '13th',
            '21st',
            '22nd',
            '31st',
        ]);
    });
});
