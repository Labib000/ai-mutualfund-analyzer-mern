import {
    type NavPoint,
    type NavProvider,
    NavProviderError,
} from '../../src/nav/navProvider.js';

/** In-memory NavProvider that records every call (port of tests/Support/FakeNavProvider). */
export class FakeNavProvider implements NavProvider {
    /** [amfiCode, from] for each call. */
    calls: Array<[number, string | null]> = [];

    failing = false;

    /** NAVs keyed by AMFI code, then "YYYY-MM-DD" date. */
    constructor(public navs: Record<number, Record<string, string>> = {}) {}

    async history(
        amfiCode: number,
        from: string | null = null,
    ): Promise<NavPoint[]> {
        this.calls.push([amfiCode, from]);

        if (this.failing) {
            throw new NavProviderError('Provider is down.');
        }

        return Object.entries(this.navs[amfiCode] ?? {})
            .filter(([date]) => from === null || date >= from)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([date, nav]) => ({ date, nav }));
    }
}
