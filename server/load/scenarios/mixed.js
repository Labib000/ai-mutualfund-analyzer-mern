// A realistic mix of reads, for "how many requests a second can one instance
// take?". Ramp RATE up run by run until p95 or errors break the thresholds.
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
    scenarios: { mixed: arrivalRate({ rate: 30 }) },
    thresholds: thresholds(['dashboard', 'holdings', 'fund', 'me']),
};

export default function () {
    const { holdingIds } = ensureSession();
    const roll = Math.random();

    if (roll < 0.4) {
        get('/api/dashboard', 'dashboard');
    } else if (roll < 0.65) {
        get('/api/holdings', 'holdings');
    } else if (roll < 0.85) {
        get(`/api/holdings/${pick(holdingIds)}`, 'fund');
    } else if (roll < 0.97) {
        get('/api/auth/me', 'me');
    } else {
        const ids = new Set();
        while (ids.size < 2) ids.add(pick(schemeIds));
        get(`/api/compare?ids=${[...ids].join(',')}`, 'compare');
    }
}

export const handleSummary = summary('mixed');
