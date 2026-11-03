/**
 * Historical NAVs from mfapi.in, which mirrors AMFI data per scheme code
 * (port of App\Nav\MfApiNavProvider).
 *
 * GET /mf/{code}?startDate=Y-m-d&endDate=Y-m-d returns
 * {"meta": {"scheme_code": 135762, ...}, "data": [{"date": "07-10-2026", "nav": "29.23040"}, ...]}
 * newest first. Unknown codes return 200 with scheme_code 0 and no data.
 */
import { parseDayMonthYear } from '../lib/dates.js';
import { Decimal } from '../lib/decimal.js';
import { today } from '../lib/today.js';
import {
    type NavPoint,
    type NavProvider,
    NavProviderError,
} from './navProvider.js';

const ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

export type MfApiOptions = {
    baseUrl: string;
    timeoutSeconds: number;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export class MfApiNavProvider implements NavProvider {
    constructor(private readonly options: MfApiOptions) {}

    async history(amfiCode: number, from?: string | null): Promise<NavPoint[]> {
        const url = new URL(
            `/mf/${amfiCode}`,
            this.options.baseUrl.replace(/\/+$/, '') + '/',
        );

        if (from) {
            url.searchParams.set('startDate', from);
            url.searchParams.set('endDate', today());
        }

        const body = await this.getJson(url, amfiCode);

        if (
            !isRecord(body) ||
            !Array.isArray(body.data) ||
            !isRecord(body.meta)
        ) {
            throw new NavProviderError(
                `mfapi.in returned a malformed response for scheme ${amfiCode}.`,
            );
        }

        if (Number(body.meta.scheme_code ?? 0) !== amfiCode) {
            throw new NavProviderError(
                `mfapi.in does not know scheme ${amfiCode}.`,
            );
        }

        return parseNavs(amfiCode, body.data);
    }

    private async getJson(url: URL, amfiCode: number): Promise<unknown> {
        const fetchFn = this.options.fetch ?? fetch;
        const sleep = this.options.sleep ?? defaultSleep;
        let lastError = '';

        for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
            if (attempt > 1) await sleep(RETRY_DELAY_MS);

            let response: Response;
            try {
                response = await fetchFn(url, {
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(
                        this.options.timeoutSeconds * 1000,
                    ),
                });
            } catch (error) {
                lastError =
                    error instanceof Error ? error.message : String(error);
                continue;
            }

            if (!response.ok) {
                lastError = `HTTP ${response.status}`;
                continue;
            }

            try {
                return await response.json();
            } catch {
                throw new NavProviderError(
                    `mfapi.in returned a malformed response for scheme ${amfiCode}.`,
                );
            }
        }

        throw new NavProviderError(
            `mfapi.in request for scheme ${amfiCode} failed: ${lastError}`,
        );
    }
}

function parseNavs(amfiCode: number, data: unknown[]): NavPoint[] {
    const navs = new Map<string, string>();

    for (const point of data) {
        const date =
            isRecord(point) && typeof point.date === 'string'
                ? parseDayMonthYear(point.date)
                : null;
        const nav =
            isRecord(point) && typeof point.nav === 'string' ? point.nav : '';

        if (date === null || !Decimal.isNumeric(nav)) {
            throw new NavProviderError(
                `mfapi.in returned a malformed NAV entry for scheme ${amfiCode}.`,
            );
        }

        // Skip placeholder zero NAVs, which segregated portfolios report.
        if (Decimal.compare(nav, '0') > 0) {
            navs.set(date, Decimal.round(nav, 4));
        }
    }

    return [...navs]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, nav]) => ({ date, nav }));
}
