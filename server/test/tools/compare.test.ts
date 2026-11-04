import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { Scheme } from '../../src/models/scheme.js';
import { createUser, loginAs, makeTestApp } from '../support/app.js';
import { useTestDb } from '../support/db.js';
import {
    businessDayNavs,
    createForeignHolding,
    usePortfolio,
} from '../support/portfolio.js';
import { createScheme } from '../support/schemes.js';

describe('fund compare', () => {
    useTestDb();
    const p = usePortfolio();

    /** A scheme nobody holds, with NAV history at the fake provider. */
    async function otherScheme(overrides = {}) {
        const navs = businessDayNavs('2023-01-02', '2026-10-07');
        const scheme = await createScheme({
            latestNav: navs['2026-10-07'],
            latestNavDate: '2026-10-07',
            ...overrides,
        });
        p().navProvider.navs[scheme.amfiCode] = navs;
        return scheme;
    }

    const compare = (ids: string[]) =>
        p()
            .agent.get('/api/compare')
            .query({ ids: ids.join(',') });

    it('answers 401 for guests', async () => {
        await request(p().app).get('/api/compare?ids=x').expect(401);
    });

    it('compares funds in the order asked, marking the ones the user holds', async () => {
        const other = await otherScheme();

        const res = await compare([other.id, p().scheme.id]).expect(200);

        expect(res.body.riskFreeRatePct).toBe(6.5);
        expect(
            res.body.funds.map((f: { scheme: { id: string } }) => f.scheme.id),
        ).toEqual([other.id, p().scheme.id]);
        expect(res.body.funds[0].holdingId).toBeNull();
        expect(res.body.funds[1].holdingId).toBe(p().holding.id);

        const stats = res.body.funds[0].stats;
        expect(stats.since).toBe('2023-01-02');
        expect(stats.asOf).toBe('2026-10-07');
        expect(stats.trailing.y1Pct).not.toBeNull();
        expect(stats.trailing.y5Pct).toBeNull();
        expect(stats.series.at(-1)[0]).toBe('2026-10-07');
    });

    it("doesn't mark another user's holding as the user's", async () => {
        const foreign = await createForeignHolding();
        const scheme = (await Scheme.findById(foreign.schemeId))!;
        p().navProvider.navs[scheme.amfiCode] = businessDayNavs(
            '2025-01-01',
            '2026-10-07',
        );

        const res = await compare([scheme.id]).expect(200);

        expect(res.body.funds[0].holdingId).toBeNull();
    });

    it('fetches a fund’s history once, then answers from the cache', async () => {
        const other = await otherScheme();

        await compare([other.id]).expect(200);
        const calls = p().navProvider.calls.length;
        expect(calls).toBeGreaterThan(0);

        const again = await compare([other.id]).expect(200);
        expect(p().navProvider.calls.length).toBe(calls);
        expect(again.body.funds[0].stats.asOf).toBe('2026-10-07');
    });

    it('recomputes once a newer NAV is published', async () => {
        const other = await otherScheme();
        await compare([other.id]).expect(200);

        p().navProvider.navs[other.amfiCode]!['2026-10-08'] = '99.0000';
        await Scheme.updateOne(
            { _id: other._id },
            { latestNav: '99.0000', latestNavDate: '2026-10-08' },
        );

        const res = await compare([other.id]).expect(200);
        expect(res.body.funds[0].stats.asOf).toBe('2026-10-08');
        expect(res.body.funds[0].stats.latestNav).toBe('99.0000');
    });

    it.each([
        ['nothing', ''],
        ['a malformed id', 'nope'],
        [
            'four funds',
            'a'.repeat(24) +
                ',' +
                'b'.repeat(24) +
                ',' +
                'c'.repeat(24) +
                ',' +
                'd'.repeat(24),
        ],
    ])('rejects %s', async (_label, ids) => {
        const res = await p()
            .agent.get('/api/compare')
            .query({ ids })
            .expect(422);

        expect(res.body.errors.ids).toBe(
            'Choose between 1 and 3 funds to compare.',
        );
    });

    it('rejects the same fund twice', async () => {
        const res = await compare([p().scheme.id, p().scheme.id]).expect(422);

        expect(res.body.errors.ids).toBe(
            'Each fund can only be compared once.',
        );
    });

    it('rejects unknown and inactive funds', async () => {
        const inactive = await otherScheme({ isActive: false });

        for (const id of [inactive.id, 'f'.repeat(24)]) {
            const res = await compare([p().scheme.id, id]).expect(422);
            expect(res.body.errors.ids).toBe(
                'One of these funds is no longer available.',
            );
        }
    });

    it('answers 503 naming the fund when its history cannot be fetched', async () => {
        const other = await otherScheme({
            name: 'Unlucky Fund - Direct Plan - Growth',
        });
        p().navProvider.failing = true;

        const res = await compare([other.id]).expect(503);

        expect(res.body.message).toBe(
            "Couldn't load the NAV history for Unlucky Fund - Direct Plan - Growth. Please try again.",
        );
    });

    it('needs a verified email', async () => {
        const user = await createUser({ verified: false });
        const agent = await loginAs(makeTestApp().agent(), user);

        await agent
            .get('/api/compare')
            .query({ ids: p().scheme.id })
            .expect(403);
    });
});
