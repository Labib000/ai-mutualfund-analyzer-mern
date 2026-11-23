// Shared helpers for the k6 scenarios. k6 runs this (not Node): plain JS only.
import http from 'k6/http';
import { check, fail } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// Writes must carry the app's Origin (CSRF check), as the browser sends it.
export const ORIGIN = __ENV.ORIGIN || 'http://localhost:5173';

const seed = JSON.parse(open('../data/seed.json'));
export const users = seed.users;
export const schemeIds = seed.schemeIds;

/**
 * An open model: requests arrive at RATE per second whatever the latency, so
 * slow responses show up as latency instead of quietly lowering the load
 * (avoids "coordinated omission").
 */
export function arrivalRate(defaults = {}) {
    const rate = Number(__ENV.RATE || defaults.rate || 20);
    return {
        executor: 'constant-arrival-rate',
        rate,
        timeUnit: '1s',
        duration: __ENV.DURATION || defaults.duration || '60s',
        preAllocatedVUs: Number(__ENV.VUS || Math.max(10, rate)),
        maxVUs: Number(__ENV.MAX_VUS || Math.max(50, rate * 5)),
    };
}

/** Fail the run when errors pass 1% or p95 passes P95 ms for these request names. */
export function thresholds(names, p95 = 500) {
    const limit = Number(__ENV.P95 || p95);
    const out = { http_req_failed: ['rate<0.01'] };
    for (const name of names) {
        out[`http_req_duration{name:${name}}`] = [`p(95)<${limit}`];
    }
    return out;
}

const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: ORIGIN,
};

export function login(email) {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ email, password: seed.password }),
        { headers: jsonHeaders, tags: { name: 'login' } },
    );
    if (!check(res, { 'login 200': (r) => r.status === 200 })) {
        fail(`login failed for ${email}: ${res.status} ${res.body}`);
    }
    return res;
}

let session = null;

/**
 * Logs this VU in once, as one of the seeded users; k6 keeps the session
 * cookie in the VU's cookie jar. Returns the user's holding ids.
 */
export function ensureSession() {
    if (session) return session;

    const email = users[(__VU - 1) % users.length];
    login(email);

    const res = get('/api/holdings', 'holdings');
    session = {
        email,
        holdingIds: res.json('holdings').map((h) => h.id),
    };
    return session;
}

export function get(path, name) {
    const res = http.get(`${BASE_URL}${path}`, {
        headers: { Accept: 'application/json' },
        tags: { name },
    });
    check(res, { [`${name} 200`]: (r) => r.status === 200 });
    return res;
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Prints the usual summary and saves it as results/<scenario>.json. */
export function summary(scenario) {
    return (data) => ({
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
        [`/load/results/${scenario}.json`]: JSON.stringify(data, null, 2),
    });
}
