import { describe, expect, it } from 'vitest';

import { Decimal, roundFloat } from '../../src/lib/decimal.js';

// Port of tests/Unit/Support/DecimalTest.php
describe('Decimal.round', () => {
    it.each([
        ['drops trailing zero', '29.23040', 4, '29.2304'],
        ['rounds down', '14.86269632', 4, '14.8627'],
        ['exactly half rounds up', '1.00005', 4, '1.0001'],
        ['just below half rounds down', '1.000049999', 4, '1.0000'],
        ['pads to scale', '12', 4, '12.0000'],
        ['carries across digits', '9.99995', 4, '10.0000'],
        ['large value', '2540201.95084999', 4, '2540201.9508'],
        ['negative half rounds away from zero', '-1.00005', 4, '-1.0001'],
        ['negative rounding to zero has no sign', '-0.00001', 4, '0.0000'],
        ['zero scale', '2.5', 0, '3'],
        ['units scale', '123.45650', 3, '123.457'],
    ])('%s', (_name, value, scale, expected) => {
        expect(Decimal.round(value, scale)).toBe(expected);
    });

    it('rejects non-numeric input', () => {
        expect(() => Decimal.round('N.A.', 4)).toThrow(RangeError);
    });
});

describe('Decimal.isNumeric', () => {
    it('accepts plain decimals only', () => {
        expect(Decimal.isNumeric('29.2304')).toBe(true);
        expect(Decimal.isNumeric('-3')).toBe(true);
        expect(Decimal.isNumeric('N.A.')).toBe(false);
        expect(Decimal.isNumeric('1e5')).toBe(false);
        expect(Decimal.isNumeric('.5')).toBe(false);
        expect(Decimal.isNumeric('')).toBe(false);
    });
});

describe('Decimal.compare', () => {
    it('compares exactly', () => {
        expect(Decimal.compare('0.00000001', '0')).toBe(1);
        expect(Decimal.compare('10.5000', '10.5')).toBe(0);
        expect(Decimal.compare('-1', '0')).toBe(-1);
    });
});

describe('bcmath-style arithmetic', () => {
    it('truncates towards zero to the scale, like bcmath', () => {
        expect(Decimal.div('2', '3', 4)).toBe('0.6666');
        expect(Decimal.div('-2', '3', 4)).toBe('-0.6666');
        expect(Decimal.div('9999.50', '29.1100', 10)).toBe('343.5073857780');
        expect(Decimal.mul('343.507', '29.2304', 7)).toBe('10040.8470128');
        expect(Decimal.add('100.500', '50.250', 3)).toBe('150.750');
        expect(Decimal.sub('10.000', '10.001', 3)).toBe('-0.001');
    });

    it('pads to the scale and never returns a signed zero', () => {
        expect(Decimal.add('0', '0', 3)).toBe('0.000');
        expect(Decimal.mul('0.000', '-1', 3)).toBe('0.000');
        expect(Decimal.sub('1', '1.0004', 3)).toBe('0.000');
    });

    it('refuses to divide by zero', () => {
        expect(() => Decimal.div('1', '0', 4)).toThrow(RangeError);
    });
});

describe('roundFloat', () => {
    it("rounds half away from zero like PHP's round()", () => {
        expect(roundFloat(13.636363636, 2)).toBe(13.64);
        expect(roundFloat(11.502061795, 2)).toBe(11.5);
        expect(roundFloat(1.005, 2)).toBe(1.01);
        expect(roundFloat(-2.5, 0)).toBe(-3);
        expect(roundFloat(-0.125, 2)).toBe(-0.13);
    });
});
