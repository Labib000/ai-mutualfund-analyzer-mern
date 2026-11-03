import { beforeEach, describe, expect, it } from 'vitest';

import { NavHistory } from '../../src/models/navHistory.js';
import { Scheme, type SchemeDoc } from '../../src/models/scheme.js';
import { NavLookup } from '../../src/nav/navLookup.js';
import { NavProviderError } from '../../src/nav/navProvider.js';
import { useTestDb } from '../support/db.js';
import { FakeNavProvider } from '../support/fakeNavProvider.js';
import { createScheme } from '../support/schemes.js';

// Port of tests/Feature/Nav/NavLookupTest.php
// October 2026: Thu 1st trading, Fri 2nd holiday (Gandhi Jayanti),
// Sat 3rd and Sun 4th weekend, Mon 5th trading.
const CODE = 135762;

describe('NavLookup', () => {
    useTestDb();

    let provider: FakeNavProvider;
    let lookup: NavLookup;
    let scheme: SchemeDoc;

    const fresh = async () => (await Scheme.findById(scheme._id))!;

    beforeEach(async () => {
        provider = new FakeNavProvider({
            [CODE]: {
                '2026-09-30': '29.1843',
                '2026-10-01': '29.0001',
                '2026-10-05': '29.1100',
                '2026-10-06': '29.3369',
                '2026-10-07': '29.2304',
            },
        });
        lookup = new NavLookup(provider);
        scheme = await createScheme({
            amfiCode: CODE,
            latestNav: '29.2304',
            latestNavDate: '2026-10-07',
        });
    });

    it("uses that day's NAV for a transaction on a trading day", async () => {
        expect(await lookup.forTransaction(scheme, '2026-10-06')).toEqual({
            date: '2026-10-06',
            nav: '29.3369',
        });
    });

    it("uses the next business day's NAV for a transaction on a holiday", async () => {
        expect(await lookup.forTransaction(scheme, '2026-10-02')).toEqual({
            date: '2026-10-05',
            nav: '29.1100',
        });
    });

    it("uses the next business day's NAV for a transaction on a weekend", async () => {
        const point = await lookup.forTransaction(scheme, '2026-10-04');

        expect(point?.date).toBe('2026-10-05');
    });

    it('returns null for a transaction whose NAV is not published yet', async () => {
        expect(await lookup.forTransaction(scheme, '2026-10-08')).toBeNull();
    });

    it('skips a month-end weekend NAV for transactions but uses it for valuation', async () => {
        // Real pattern: Axis Children's Fund published a NAV on Saturday 31 Jan 2026.
        const weekendProvider = new FakeNavProvider({
            [CODE]: {
                '2026-01-30': '29.5649',
                '2026-01-31': '29.5655',
                '2026-02-02': '29.3753',
            },
        });
        const weekendLookup = new NavLookup(weekendProvider);
        scheme.latestNavDate = '2026-02-02';
        await scheme.save();

        expect(
            await weekendLookup.forTransaction(scheme, '2026-01-31'),
        ).toEqual({
            date: '2026-02-02',
            nav: '29.3753',
        });

        const valuation = await weekendLookup.forValuation(
            scheme,
            '2026-02-01',
        );
        expect(valuation?.date).toBe('2026-01-31');
    });

    it('does not use a NAV more than seven days later', async () => {
        const sparse = new FakeNavProvider({
            [CODE]: { '2026-09-01': '10.0000', '2026-09-20': '11.0000' },
        });

        expect(
            await new NavLookup(sparse).forTransaction(scheme, '2026-09-10'),
        ).toBeNull();
    });

    it('uses the previous NAV for valuation on a weekend', async () => {
        expect(await lookup.forValuation(scheme, '2026-10-04')).toEqual({
            date: '2026-10-01',
            nav: '29.0001',
        });
    });

    it('returns null for valuation before the first NAV', async () => {
        expect(await lookup.forValuation(scheme, '2026-09-01')).toBeNull();
    });

    it('fetches the full history on the first lookup and tracks the scheme', async () => {
        await lookup.forValuation(scheme, '2026-10-07');

        expect(provider.calls).toEqual([[CODE, null]]);
        expect(await NavHistory.countDocuments()).toBe(5);
        expect((await fresh()).historySyncedAt).toBeInstanceOf(Date);
    });

    it('serves later lookups from the stored history', async () => {
        await lookup.forValuation(scheme, '2026-10-07');
        await lookup.forTransaction(scheme, '2026-10-02');
        await lookup.forValuation(scheme, '2026-10-01');

        expect(provider.calls).toHaveLength(1);
    });

    it('fetches only the missing range when behind the latest NAV', async () => {
        await lookup.forValuation(scheme, '2026-10-07');

        // The nightly import was missed on the 8th and saw the 9th.
        provider.navs[CODE]!['2026-10-08'] = '29.4000';
        provider.navs[CODE]!['2026-10-09'] = '29.5000';
        scheme.set({ latestNav: '29.5000', latestNavDate: '2026-10-09' });
        await scheme.save();

        const point = await lookup.forTransaction(scheme, '2026-10-08');

        expect(point?.nav).toBe('29.4000');
        expect(provider.calls[1]).toEqual([CODE, '2026-10-08']);
        expect(await NavHistory.countDocuments()).toBe(7);
    });

    it('throws when the first fetch fails and leaves the scheme untracked', async () => {
        provider.failing = true;

        await expect(lookup.forValuation(scheme, '2026-10-07')).rejects.toThrow(
            NavProviderError,
        );
        expect((await fresh()).historySyncedAt).toBeNull();
        expect(scheme.historySyncedAt).toBeNull();
    });

    it('falls back to stored history when a gap refresh fails', async () => {
        await lookup.forValuation(scheme, '2026-10-07');
        scheme.latestNavDate = '2026-10-09';
        await scheme.save();
        provider.failing = true;

        const point = await lookup.forValuation(scheme, '2026-10-09');

        expect(point?.date).toBe('2026-10-07');
    });
});
