// Fund compare: three funds' full NAV histories, rolling returns and ratios
// (cached per scheme). The app limits compare to 30 a minute per user, so keep
// RATE × 2 below the number of seeded users or expect 429s.
import {
    arrivalRate,
    ensureSession,
    get,
    pick,
    schemeIds,
    summary,
    thresholds,
} from '../lib/common.js';

export const options = {
    // Keep the session cookie between iterations (k6 clears it by default).
    noCookiesReset: true,
    scenarios: { compare: arrivalRate({ rate: 10 }) },
    thresholds: thresholds(['compare'], 1000),
};

export default function () {
    ensureSession();
    const ids = new Set();
    while (ids.size < 3) ids.add(pick(schemeIds));
    get(`/api/compare?ids=${[...ids].join(',')}`, 'compare');
}

export const handleSummary = summary('compare');
