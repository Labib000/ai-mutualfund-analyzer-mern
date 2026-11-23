// Login: argon2 hashing is CPU-bound, so watch the server's event-loop lag
// and CPU, not just latency. Each request hashes a password on the main thread.
import {
    arrivalRate,
    login,
    pick,
    summary,
    thresholds,
    users,
} from '../lib/common.js';
import http from 'k6/http';

export const options = {
    scenarios: { login: arrivalRate({ rate: 5 }) },
    thresholds: thresholds(['login'], 1000),
};

export default function () {
    // A fresh cookie jar each time, so every iteration is a real sign-in.
    http.cookieJar().clear(__ENV.BASE_URL || 'http://localhost:3000');
    login(pick(users));
}

export const handleSummary = summary('login');
