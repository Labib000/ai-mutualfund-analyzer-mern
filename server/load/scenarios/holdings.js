// The portfolio list and a fund page (summary, fund facts, SIPs, transactions).
import {
    arrivalRate,
    ensureSession,
    get,
    pick,
    summary,
    thresholds,
} from '../lib/common.js';

export const options = {
    // Keep the session cookie between iterations (k6 clears it by default).
    noCookiesReset: true,
    scenarios: { holdings: arrivalRate({ rate: 20 }) },
    thresholds: thresholds(['holdings', 'fund']),
};

export default function () {
    const { holdingIds } = ensureSession();
    get('/api/holdings', 'holdings');
    get(`/api/holdings/${pick(holdingIds)}`, 'fund');
}

export const handleSummary = summary('holdings');
