// The dashboard: valuation of every holding, value history (cached per user),
// period changes, insights and allocation. The heaviest page most users load.
// Run once after `npm run db:seed:load -- --clear-cache` for cold-cache
// numbers, then again for warm-cache numbers.
import {
    arrivalRate,
    ensureSession,
    get,
    summary,
    thresholds,
} from '../lib/common.js';

export const options = {
    // Keep the session cookie between iterations (k6 clears it by default).
    noCookiesReset: true,
    scenarios: { dashboard: arrivalRate({ rate: 20 }) },
    thresholds: thresholds(['dashboard']),
};

export default function () {
    ensureSession();
    get('/api/dashboard', 'dashboard');
}

export const handleSummary = summary('dashboard');
