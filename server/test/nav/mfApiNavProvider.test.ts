import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setTestNow } from '../../src/lib/today.js';
import { MfApiNavProvider } from '../../src/nav/mfApiNavProvider.js';
import { NavProviderError } from '../../src/nav/navProvider.js';
import { hrefOf } from '../support/http.js';

// Port of tests/Feature/Nav/MfApiNavProviderTest.php
type Point = { date: string; nav: string };

const body = (code: number, data: Point[] | unknown[]) => ({
    meta: { scheme_code: code, scheme_name: 'Test Fund' },
    data,
    status: 'SUCCESS',
});

const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

function providerWith(respond: () => Response | Promise<Response>) {
    const fetch = vi.fn(async (_url: string | URL | Request) => respond());
    const provider = new MfApiNavProvider({
        baseUrl: 'https://api.mfapi.in',
        timeoutSeconds: 5,
        fetch,
        sleep: async () => {},
    });
    const urls = () => fetch.mock.calls.map(([url]) => new URL(hrefOf(url)));

    return { provider, fetch, urls };
}

describe('MfApiNavProvider', () => {
    beforeEach(() => setTestNow('2026-10-08T10:00:00+05:30'));
    afterEach(() => setTestNow(null));

    it('returns NAVs oldest first, rounded to four decimals', async () => {
        const { provider } = providerWith(() =>
            json(
                body(135762, [
                    { date: '07-10-2026', nav: '29.23040' },
                    { date: '06-10-2026', nav: '29.33690' },
                    { date: '01-10-2026', nav: '29.000149' },
                ]),
            ),
        );

        expect(await provider.history(135762)).toEqual([
            { date: '2026-10-01', nav: '29.0001' },
            { date: '2026-10-06', nav: '29.3369' },
            { date: '2026-10-07', nav: '29.2304' },
        ]);
    });

    it('requests the full history without a start date', async () => {
        const { provider, urls } = providerWith(() => json(body(135762, [])));

        await provider.history(135762);

        expect(urls().map(String)).toEqual(['https://api.mfapi.in/mf/135762']);
    });

    it('requests a range from the start date up to today (IST)', async () => {
        const { provider, urls } = providerWith(() => json(body(135762, [])));

        await provider.history(135762, '2026-09-01');

        const url = urls()[0]!;
        expect(url.pathname).toBe('/mf/135762');
        expect(url.searchParams.get('startDate')).toBe('2026-09-01');
        expect(url.searchParams.get('endDate')).toBe('2026-10-08');
    });

    it('skips zero NAVs', async () => {
        const { provider } = providerWith(() =>
            json(
                body(148239, [
                    { date: '07-10-2026', nav: '0.00000' },
                    { date: '06-10-2026', nav: '10.50000' },
                ]),
            ),
        );

        expect(await provider.history(148239)).toEqual([
            { date: '2026-10-06', nav: '10.5000' },
        ]);
    });

    it('throws for an unknown scheme', async () => {
        const { provider } = providerWith(() => json(body(0, [])));

        await expect(provider.history(999999)).rejects.toThrow(
            /does not know scheme 999999/,
        );
    });

    it('throws after retrying a server error', async () => {
        const { provider, fetch } = providerWith(
            () => new Response('Bad gateway', { status: 502 }),
        );

        await expect(provider.history(135762)).rejects.toThrow(
            NavProviderError,
        );
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('throws on a connection failure', async () => {
        const { provider } = providerWith(() => {
            throw new TypeError('fetch failed');
        });

        await expect(provider.history(135762)).rejects.toThrow(
            NavProviderError,
        );
    });

    it('throws on a malformed body', async () => {
        const { provider } = providerWith(
            () => new Response('<html>oops</html>'),
        );

        await expect(provider.history(135762)).rejects.toThrow(
            NavProviderError,
        );
    });

    it('throws on a malformed entry', async () => {
        const { provider } = providerWith(() =>
            json(body(135762, [{ date: '2026-10-07', nav: '29.2304' }])),
        );

        await expect(provider.history(135762)).rejects.toThrow(
            NavProviderError,
        );
    });
});
