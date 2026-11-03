import { describe, expect, it } from 'vitest';

import {
    purchaseUnits,
    redemptionAmount,
    stampDuty,
} from '../../src/portfolio/unitCalculator.js';

// Port of tests/Unit/Portfolio/UnitCalculatorTest.php
describe('UnitCalculator', () => {
    it.each([
        ['₹10,000', 1000000, 50],
        ['₹500 rounds 2.5 paise up', 50000, 3],
        ['₹499 rounds 2.495 paise down', 49900, 2],
        ['₹1', 100, 0],
        ['zero', 0, 0],
        ['₹10 crore', 10000000000, 500000],
    ])('stamp duty: %s', (_name, amount, expected) => {
        expect(stampDuty(amount)).toBe(expected);
    });

    it('rejects a negative stamp duty amount', () => {
        expect(() => stampDuty(-1)).toThrow(RangeError);
    });

    it('deducts stamp duty from purchase units and rounds to three decimals', () => {
        expect(purchaseUnits(1000000, 50, '29.1100')).toBe('343.507');
        expect(purchaseUnits(50000, 3, '29.1100')).toBe('17.175');
    });

    it('handles purchase units for large amounts', () => {
        expect(purchaseUnits(1000000000, 5000, '10.0000')).toBe('999995.000');
    });

    it('rounds tiny purchases at high NAVs to zero units', () => {
        expect(purchaseUnits(100, 0, '2540201.9508')).toBe('0.000');
    });

    it('rejects a zero NAV for purchase units', () => {
        expect(() => purchaseUnits(100000, 5, '0')).toThrow(RangeError);
    });

    it('rejects stamp duty above the amount', () => {
        expect(() => purchaseUnits(100, 101, '10.0000')).toThrow(RangeError);
    });

    it('gives the redemption amount in paise', () => {
        expect(redemptionAmount('343.507', '29.2304')).toBe(1004085);
        expect(redemptionAmount('1.000', '10.0000')).toBe(1000);
    });

    it('rejects zero units for a redemption amount', () => {
        expect(() => redemptionAmount('0.000', '10.0000')).toThrow(RangeError);
    });
});
