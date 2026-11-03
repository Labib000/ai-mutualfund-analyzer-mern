import { describe, expect, it } from 'vitest';

import { FifoLots, OversellError } from '../../src/portfolio/fifoLots.js';

// Port of tests/Unit/Portfolio/FifoLotsTest.php
describe('FifoLots', () => {
    it('tracks purchases only', () => {
        const lots = new FifoLots();
        lots.buy('100.000', 100000);
        lots.buy('50.500', 60000);

        expect(lots.unitsHeld()).toBe('150.500');
        expect(lots.costPaise()).toBe(160000);
        expect(lots.realisedGainPaise()).toBe(0);
    });

    it('sells the oldest lot first in a partial redemption', () => {
        const lots = new FifoLots();
        lots.buy('100.000', 100000); // ₹10 a unit
        lots.buy('100.000', 200000); // ₹20 a unit
        lots.sell('40.000', 100000);

        expect(lots.unitsHeld()).toBe('160.000');
        expect(lots.costPaise()).toBe(60000 + 200000);
        expect(lots.realisedGainPaise()).toBe(100000 - 40000);
    });

    it('handles a redemption spanning two lots', () => {
        const lots = new FifoLots();
        lots.buy('100.000', 100000);
        lots.buy('100.000', 200000);
        lots.sell('150.000', 450000);

        // All of lot 1 (₹1,000) and half of lot 2 (₹1,000).
        expect(lots.unitsHeld()).toBe('50.000');
        expect(lots.costPaise()).toBe(100000);
        expect(lots.realisedGainPaise()).toBe(450000 - 200000);
    });

    it('leaves no cost after a full redemption', () => {
        const lots = new FifoLots();
        lots.buy('343.507', 1000000);
        lots.buy('171.316', 500000);
        lots.sell('514.823', 1600000);

        expect(lots.unitsHeld()).toBe('0.000');
        expect(lots.costPaise()).toBe(0);
        expect(lots.realisedGainPaise()).toBe(100000);
    });

    it('never leaves a rounding remainder on a consumed lot', () => {
        const lots = new FifoLots();
        lots.buy('3.000', 100); // ₹1 for 3 units: a third of a paisa each

        lots.sell('1.000', 40); // removes 33 paise (rounded)
        lots.sell('1.000', 40); // removes 33 or 34 paise
        lots.sell('1.000', 40); // removes exactly what is left

        expect(lots.costPaise()).toBe(0);
        expect(lots.realisedGainPaise()).toBe(120 - 100);
    });

    it('refuses to sell more than held', () => {
        const lots = new FifoLots();
        lots.buy('10.000', 10000);

        expect(() => lots.sell('10.001', 10000)).toThrow(OversellError);
    });
});
