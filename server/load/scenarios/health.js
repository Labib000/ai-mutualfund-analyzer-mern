// Baseline: Express + one Mongo ping, no session. The floor for every other route.
import { arrivalRate, get, summary, thresholds } from '../lib/common.js';

export const options = {
    scenarios: { health: arrivalRate({ rate: 50 }) },
    thresholds: thresholds(['health'], 100),
};

export default function () {
    get('/api/health', 'health');
}

export const handleSummary = summary('health');
