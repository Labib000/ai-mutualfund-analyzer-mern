import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { cacheGet, cachePut } from '../src/lib/cache.js';
import {
    LatencySeries,
    type MetricsSnapshot,
    metrics,
    percentile,
    routeLabel,
} from '../src/lib/metrics.js';
import { createUser, loginAs, makeTestApp } from './support/app.js';
import { useTestDb } from './support/db.js';

const CRON_SECRET = 'cron-secret-'.padEnd(40, 'y');

describe('metrics helpers', () => {
    it('takes nearest-rank percentiles', () => {
        const sorted = Array.from({ length: 100 }, (_, i) => i + 1);

        expect(percentile(sorted, 50)).toBe(50);
        expect(percentile(sorted, 95)).toBe(95);
        expect(percentile(sorted, 99)).toBe(99);
        expect(percentile(sorted, 100)).toBe(100);
        expect(percentile([], 95)).toBe(0);
        expect(percentile([7], 50)).toBe(7);
    });

    it('summarises a latency series', () => {
        const series = new LatencySeries();
        for (const ms of [10, 20, 30, 40]) series.record(ms);

        expect(series.summary()).toEqual({
            count: 4,
            meanMs: 25,
            p50Ms: 20,
            p95Ms: 40,
            p99Ms: 40,
            maxMs: 40,
        });
    });

    it('keeps counting past the ring size, with percentiles over recent samples', () => {
        const series = new LatencySeries();
        for (let i = 0; i < 5_000; i++) series.record(1_000);
        for (let i = 0; i < 5_000; i++) series.record(1);

        const summary = series.summary();
        expect(summary.count).toBe(10_000);
        expect(summary.maxMs).toBe(1_000);
        expect(summary.p99Ms).toBe(1);
    });

    it('labels routes without ids or query strings', () => {
        expect(
            routeLabel('GET', '/api/holdings/66a1b2c3d4e5f6a7b8c9d0e1?page=2'),
        ).toBe('GET /api/holdings/:id');
        expect(
            routeLabel(
                'DELETE',
                '/api/holdings/66a1b2c3d4e5f6a7b8c9d0e1/sips/66a1b2c3d4e5f6a7b8c9d0e2',
            ),
        ).toBe('DELETE /api/holdings/:id/sips/:id');
        expect(routeLabel('GET', '/api/schemes/123')).toBe(
            'GET /api/schemes/:n',
        );
        expect(routeLabel('GET', '/assets/index-abc.js')).toBe('GET (static)');
    });
});

describe('/internal/metrics', () => {
    useTestDb();
    beforeEach(() => metrics.reset());

    const appWith = (cronSecret?: string) =>
        makeTestApp({
            env: cronSecret === undefined ? {} : { CRON_SECRET: cronSecret },
        });

    const read = async (app: ReturnType<typeof appWith>['app']) => {
        const res = await request(app)
            .get('/internal/metrics')
            .set('X-Cron-Secret', CRON_SECRET)
            .expect(200);
        return res.body as MetricsSnapshot;
    };

    it('is off without CRON_SECRET and needs the right secret', async () => {
        await request(appWith().app).get('/internal/metrics').expect(503);

        const { app } = appWith(CRON_SECRET);
        await request(app).get('/internal/metrics').expect(401);
        await request(app)
            .get('/internal/metrics')
            .set('X-Cron-Secret', 'wrong')
            .expect(401);
    });

    it('records latency, status and Mongo queries per route', async () => {
        const { app, agent } = appWith(CRON_SECRET);
        const client = await loginAs(agent(), await createUser());

        await client.get('/api/holdings').expect(200);
        await client.get('/api/holdings').expect(200);
        await client.get('/api/holdings/66a1b2c3d4e5f6a7b8c9d0e1').expect(404);

        const snapshot = await read(app);
        const list = snapshot.routes['GET /api/holdings']!;

        expect(list.count).toBe(2);
        expect(list.status).toEqual({ '2xx': 2 });
        expect(list.p95Ms).toBeGreaterThan(0);
        // The session lookup and the holdings query, at least.
        expect(list.dbQueriesPerRequest.mean).toBeGreaterThanOrEqual(2);

        expect(snapshot.routes['GET /api/holdings/:id']!.status).toEqual({
            '4xx': 1,
        });
        expect(snapshot.routes['POST /api/auth/login']!.count).toBe(1);
        expect(snapshot.db['find holdings']!.count).toBeGreaterThanOrEqual(2);

        // Reading the metrics isn't itself recorded.
        expect(
            Object.keys(snapshot.routes).some((r) => r.includes('metrics')),
        ).toBe(false);

        expect(snapshot.eventLoop).not.toBeNull();
        expect(snapshot.process.heapUsedMb).toBeGreaterThan(0);
    });

    it('counts cache hits, misses and writes by key prefix', async () => {
        const { app } = appWith(CRON_SECRET);

        await cacheGet('scheme-stats:a');
        await cachePut('scheme-stats:a', { x: 1 }, 60);
        await cacheGet('scheme-stats:a');
        await cacheGet('scheme-stats:a');

        expect((await read(app)).cache['scheme-stats']).toEqual({
            hits: 2,
            misses: 1,
            writes: 1,
            redis: 0,
            mongo: 4,
            hitRatio: 0.67,
        });
    });

    it('resets', async () => {
        const { app, agent } = appWith(CRON_SECRET);
        await agent().get('/api/auth/me');

        await request(app)
            .post('/internal/metrics/reset')
            .set('X-Cron-Secret', CRON_SECRET)
            .expect(200);

        expect((await read(app)).requests.total).toBe(0);
    });

    it('serves the Prometheus format to a bearer token', async () => {
        const { app, agent } = appWith(CRON_SECRET);
        const client = await loginAs(agent(), await createUser());
        await client.get('/api/holdings').expect(200);
        await cacheGet('scheme-stats:b');

        await request(app)
            .get('/internal/metrics/prometheus')
            .set('Authorization', 'Bearer wrong')
            .expect(401);

        const res = await request(app)
            .get('/internal/metrics/prometheus')
            .set('Authorization', `Bearer ${CRON_SECRET}`)
            .expect(200)
            .expect('Content-Type', /text\/plain/);

        expect(res.text).toMatch(
            /hisaab_http_request_duration_seconds_count\{method="GET",route="\/api\/holdings",status="2xx"\} [1-9]/,
        );
        expect(res.text).toMatch(
            /hisaab_http_request_db_queries_sum\{method="GET",route="\/api\/holdings"\} [1-9]/,
        );
        expect(res.text).toMatch(
            /hisaab_mongodb_command_duration_seconds_count\{command="find",collection="holdings",failed="false"\} [1-9]/,
        );
        expect(res.text).toMatch(
            /hisaab_cache_operations_total\{prefix="scheme-stats",outcome="miss",backend="mongo"\} [1-9]/,
        );
        // Node's defaults, which the Grafana dashboard uses.
        expect(res.text).toContain('nodejs_eventloop_lag_p99_seconds');
        expect(res.text).toContain('process_cpu_seconds_total');
    });
});
