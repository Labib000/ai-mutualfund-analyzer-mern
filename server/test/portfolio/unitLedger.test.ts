import { describe, expect, it } from 'vitest';

import { UnitLedger } from '../../src/portfolio/unitLedger.js';

// Port of tests/Unit/Portfolio/UnitLedgerTest.php
describe('UnitLedger', () => {
    it('holds nothing when empty', () => {
        const ledger = UnitLedger.empty();

        expect(ledger.unitsHeldOn('2026-10-01')).toBe('0.000');
        expect(ledger.firstOverdrawnDate()).toBeNull();
    });

    it("counts a day's movements only up to that day", () => {
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '100.500', true)
            .with('2026-02-10', '50.250', true)
            .with('2026-03-10', '30.000', false);

        expect(ledger.unitsHeldOn('2026-01-09')).toBe('0.000');
        expect(ledger.unitsHeldOn('2026-01-10')).toBe('100.500');
        expect(ledger.unitsHeldOn('2026-03-09')).toBe('150.750');
        expect(ledger.unitsHeldOn('2026-03-10')).toBe('120.750');
    });

    it('does not depend on entry order', () => {
        const ledger = UnitLedger.empty()
            .with('2026-03-10', '30.000', false)
            .with('2026-01-10', '100.000', true);

        expect(ledger.firstOverdrawnDate()).toBeNull();
    });

    it('leaves exactly zero after redeeming everything', () => {
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '343.507', true)
            .with('2026-02-10', '343.507', false);

        expect(ledger.unitsHeldOn('2026-02-10')).toBe('0.000');
        expect(ledger.firstOverdrawnDate()).toBeNull();
    });

    it('is overdrawn when redeeming more than held', () => {
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '10.000', true)
            .with('2026-02-10', '10.001', false);

        expect(ledger.firstOverdrawnDate()).toBe('2026-02-10');
    });

    it('accepts a purchase and redemption on the same day', () => {
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '10.000', false)
            .with('2026-01-10', '10.000', true);

        expect(ledger.firstOverdrawnDate()).toBeNull();
    });

    it('lets a back-dated redemption overdraw a later one', () => {
        // Each redemption fits on its own, but together they sell 15 of 10 units.
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '10.000', true)
            .with('2026-03-10', '8.000', false)
            .with('2026-02-10', '7.000', false);

        expect(ledger.firstOverdrawnDate()).toBe('2026-03-10');
    });

    it('does not let a later purchase cover an earlier redemption', () => {
        const ledger = UnitLedger.empty()
            .with('2026-01-10', '5.000', false)
            .with('2026-02-10', '10.000', true);

        expect(ledger.firstOverdrawnDate()).toBe('2026-01-10');
    });

    it('returns a copy from with()', () => {
        const ledger = UnitLedger.empty();
        ledger.with('2026-01-10', '10.000', true);

        expect(ledger.unitsHeldOn('2026-12-31')).toBe('0.000');
    });

    it('rejects negative units', () => {
        expect(() =>
            UnitLedger.empty().with('2026-01-10', '-1.000', true),
        ).toThrow(RangeError);
    });

    it('builds from transactions', () => {
        const ledger = UnitLedger.fromTransactions([
            { txnDate: '2026-01-10', units: '10.000', type: 'purchase' },
            { txnDate: '2026-02-10', units: '5.000', type: 'sip_installment' },
            { txnDate: '2026-03-10', units: '12.000', type: 'redemption' },
        ]);

        expect(ledger.unitsHeldOn('2026-03-10')).toBe('3.000');
    });
});
