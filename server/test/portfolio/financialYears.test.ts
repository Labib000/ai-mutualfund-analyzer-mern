import { describe, expect, it } from 'vitest';

import { financialYears } from '../../src/portfolio/financialYears.js';

// Port of tests/Unit/Portfolio/FinancialYearsTest.php
const m = (
    date: string,
    addsUnits: boolean,
    units: string,
    amountPaise: number,
) => ({ date, addsUnits, units, amountPaise });

describe('financialYears', () => {
    it('groups flows by April-to-March years', () => {
        expect(
            financialYears([
                m('2026-04-01', true, '10', 300000),
                m('2025-03-31', true, '10', 100000),
                m('2025-04-01', true, '10', 200000),
                m('2026-03-31', false, '5', 50000),
                m('2099-12-01', true, '1', 1),
            ]),
        ).toEqual([
            { label: 'FY 2024-25', investedPaise: 100000, redeemedPaise: 0 },
            {
                label: 'FY 2025-26',
                investedPaise: 200000,
                redeemedPaise: 50000,
            },
            { label: 'FY 2026-27', investedPaise: 300000, redeemedPaise: 0 },
            { label: 'FY 2099-00', investedPaise: 1, redeemedPaise: 0 },
        ]);
    });

    it('gives no years for no movements', () => {
        expect(financialYears([])).toEqual([]);
    });
});
