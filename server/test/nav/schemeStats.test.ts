import { describe, expect, it } from 'vitest';

import { Decimal } from '../../src/lib/decimal.js';
import { NavHistory } from '../../src/models/navHistory.js';
import { Scheme } from '../../src/models/scheme.js';
import { NavLookup } from '../../src/nav/navLookup.js';
import { schemeStats } from '../../src/nav/schemeStats.js';
import { useTestDb } from '../support/db.js';
import { usePortfolio } from '../support/portfolio.js';

// Port of tests/Feature/Nav/SchemeStatsTest.php
describe('schemeStats', () => {
    useTestDb();
    const portfolio = usePortfolio();

    const syncedScheme = async () => {
        const { navProvider, scheme } = portfolio();
        await new NavLookup(navProvider).ensureHistory(scheme);
        return (await Scheme.findById(scheme._id))!;
    };

    it('comes from the stored NAV history', async () => {
        const stats = await schemeStats(await syncedScheme());

        expect(stats).not.toBeNull();
        expect(stats!.since).toBe('2025-01-01');
        expect(stats!.asOf).toBe('2026-10-07');

        // NAV on 7 Oct 2025 against 7 Oct 2026, both read from the fixture.
        const { navOn } = portfolio();
        const expected =
            Number(Decimal.div(navOn('2026-10-07'), navOn('2025-10-07'), 12)) -
            1;
        expect(stats!.return1yPct).toBeCloseTo(expected * 100, 2);
    });

    it('is cached until a newer NAV arrives', async () => {
        const scheme = await syncedScheme();
        expect((await schemeStats(scheme))?.asOf).toBe('2026-10-07');

        await NavHistory.create({
            schemeId: scheme._id,
            navDate: '2026-10-08',
            nav: '15.0000',
        });
        expect((await schemeStats(scheme))?.asOf).toBe('2026-10-07');

        await Scheme.updateOne(
            { _id: scheme._id },
            { latestNav: '15.0000', latestNavDate: '2026-10-08' },
        );
        expect(
            (await schemeStats((await Scheme.findById(scheme._id))!))?.asOf,
        ).toBe('2026-10-08');
    });

    it('is null for a scheme without history', async () => {
        expect(await schemeStats(portfolio().scheme)).toBeNull();
    });
});
