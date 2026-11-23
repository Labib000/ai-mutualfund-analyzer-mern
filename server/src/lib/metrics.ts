/**
 * In-process metrics for load testing and scaling work (Phase 4.4, R6).
 * Read with GET /internal/metrics; clear with POST /internal/metrics/reset.
 *
 * Two views of the same events:
 * - JSON (GET /internal/metrics), for k6 runs and results tables. Reset it
 *   before each run.
 * - Prometheus (GET /internal/metrics/prometheus, via prom-client), scraped by
 *   the Prometheus + Grafana stack in server/load/. Never reset, because
 *   Prometheus works from rates over time and handles restarts itself.
 * Everything lives in this process's memory and covers one instance only.
 *
 * Latency percentiles come from a ring buffer of the most recent samples per
 * route, so they describe the recent window (e.g. one load-test run after a
 * reset), not all time. Counts and totals cover everything since the reset.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { type ELDHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

import {
    Counter,
    Histogram,
    Registry,
    collectDefaultMetrics,
} from 'prom-client';

/** The Prometheus registry: Hisaab's metrics plus Node's defaults (GC, heap, event loop, CPU). */
export const promRegistry = new Registry();
collectDefaultMetrics({ register: promRegistry });

const promHttp = new Histogram({
    name: 'hisaab_http_request_duration_seconds',
    help: 'Request latency by route.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [promRegistry],
});
const promHttpDbQueries = new Histogram({
    name: 'hisaab_http_request_db_queries',
    help: 'Mongo commands per request, by route (N+1 detector).',
    labelNames: ['method', 'route'] as const,
    buckets: [0, 1, 2, 5, 10, 20, 50, 100, 250],
    registers: [promRegistry],
});
const promHttpDbSeconds = new Histogram({
    name: 'hisaab_http_request_db_seconds',
    help: 'Mongo time per request, summed over its commands, by route.',
    labelNames: ['method', 'route'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [promRegistry],
});
const promDb = new Histogram({
    name: 'hisaab_mongodb_command_duration_seconds',
    help: 'Mongo command latency by command and collection.',
    labelNames: ['command', 'collection', 'failed'] as const,
    buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [promRegistry],
});
const promCache = new Counter({
    name: 'hisaab_cache_operations_total',
    help: 'Cache lookups and writes by key prefix and outcome (hit, miss, write).',
    labelNames: ['prefix', 'outcome'] as const,
    registers: [promRegistry],
});
const promJob = new Histogram({
    name: 'hisaab_job_duration_seconds',
    help: 'Scheduled job duration (nav-import, sips-generate).',
    labelNames: ['job', 'ok'] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
    registers: [promRegistry],
});
const promRedis = new Histogram({
    name: 'hisaab_redis_command_duration_seconds',
    help: 'Redis call latency by operation (e.g. cache.get, rl.increment).',
    labelNames: ['op', 'ok'] as const,
    buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5],
    registers: [promRegistry],
});
const promRedisFallback = new Counter({
    name: 'hisaab_redis_fallback_total',
    help: 'Calls that fell back to Mongo because Redis failed, by store.',
    labelNames: ['store'] as const,
    registers: [promRegistry],
});

/** Samples kept per series for percentiles. */
const RING_SIZE = 5_000;

/** Distinct route labels kept; later ones are counted under "other". */
const MAX_ROUTES = 200;

export type LatencySummary = {
    count: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
};

/** Count, total and max over all samples; percentiles over the last RING_SIZE. */
export class LatencySeries {
    private readonly ring = new Float64Array(RING_SIZE);
    private filled = 0;
    private next = 0;
    count = 0;
    totalMs = 0;
    maxMs = 0;

    record(ms: number): void {
        this.ring[this.next] = ms;
        this.next = (this.next + 1) % RING_SIZE;
        this.filled = Math.min(this.filled + 1, RING_SIZE);
        this.count += 1;
        this.totalMs += ms;
        if (ms > this.maxMs) this.maxMs = ms;
    }

    summary(): LatencySummary {
        const sorted = this.ring.slice(0, this.filled).sort();

        return {
            count: this.count,
            meanMs: round(this.count ? this.totalMs / this.count : 0),
            p50Ms: round(percentile(sorted, 50)),
            p95Ms: round(percentile(sorted, 95)),
            p99Ms: round(percentile(sorted, 99)),
            maxMs: round(this.maxMs),
        };
    }
}

/** Nearest-rank percentile of an ascending array (0 when empty). */
export function percentile(sorted: ArrayLike<number>, p: number): number {
    if (sorted.length === 0) return 0;
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

const round = (ms: number) => Math.round(ms * 10) / 10;

/**
 * A stable label for a request path: ObjectIds and numbers become ":id" and
 * ":n", so /api/holdings/<id> is one series rather than one per holding.
 */
export function routeLabel(method: string, url: string): string {
    const path = url.split('?')[0]!;

    if (!path.startsWith('/api/') && !path.startsWith('/internal/')) {
        return `${method} (static)`;
    }

    const normalised = path
        .split('/')
        .map((part) =>
            /^[0-9a-f]{24}$/i.test(part)
                ? ':id'
                : /^\d+$/.test(part)
                  ? ':n'
                  : part,
        )
        .join('/');

    return `${method} ${normalised}`;
}

type RouteStats = {
    latency: LatencySeries;
    /** Mongo commands per request, to spot N+1 patterns. */
    dbQueries: LatencySeries;
    /** Time spent waiting on Mongo per request. */
    dbMs: LatencySeries;
    status: Record<string, number>;
};

type CacheStats = { hits: number; misses: number; writes: number };

type DbCommandStats = { latency: LatencySeries; failed: number };

type JobStats = {
    runs: number;
    failed: number;
    latency: LatencySeries;
    last: { at: string; ms: number; result: Record<string, unknown> } | null;
};

/** What a request has used so far; tracked through AsyncLocalStorage. */
type RequestScope = { dbQueries: number; dbMs: number };

const requestScope = new AsyncLocalStorage<RequestScope>();

class Metrics {
    private startedAt = new Date();
    private cpuAtStart = process.cpuUsage();
    private routes = new Map<string, RouteStats>();
    private cache = new Map<string, CacheStats>();
    private dbCommands = new Map<string, DbCommandStats>();
    private jobs = new Map<string, JobStats>();
    private redisOps = new Map<string, DbCommandStats>();
    private redisFallbacks = new Map<string, number>();
    private loop: ELDHistogram | null = null;

    /** Starts the event-loop delay monitor (idempotent). */
    start(): void {
        if (this.loop) return;
        this.loop = monitorEventLoopDelay({ resolution: 10 });
        this.loop.enable();
    }

    reset(): void {
        this.startedAt = new Date();
        this.cpuAtStart = process.cpuUsage();
        this.routes.clear();
        this.cache.clear();
        this.dbCommands.clear();
        this.jobs.clear();
        this.redisOps.clear();
        this.redisFallbacks.clear();
        this.loop?.reset();
    }

    /** Runs `fn` (the rest of a request) with its own DB counters. */
    runInRequest<T>(fn: (scope: RequestScope) => T): T {
        const scope: RequestScope = { dbQueries: 0, dbMs: 0 };
        return requestScope.run(scope, () => fn(scope));
    }

    recordRequest(
        label: string,
        status: number,
        ms: number,
        scope: RequestScope,
    ): void {
        let stats = this.routes.get(label);

        if (!stats) {
            if (this.routes.size >= MAX_ROUTES) {
                label = 'other';
                stats = this.routes.get(label);
            }
            if (!stats) {
                stats = {
                    latency: new LatencySeries(),
                    dbQueries: new LatencySeries(),
                    dbMs: new LatencySeries(),
                    status: {},
                };
                this.routes.set(label, stats);
            }
        }

        const space = label.indexOf(' ');
        const method = space > 0 ? label.slice(0, space) : '';
        const route = space > 0 ? label.slice(space + 1) : label;
        promHttp
            .labels(method, route, `${Math.floor(status / 100)}xx`)
            .observe(ms / 1000);
        promHttpDbQueries.labels(method, route).observe(scope.dbQueries);
        promHttpDbSeconds.labels(method, route).observe(scope.dbMs / 1000);

        stats.latency.record(ms);
        stats.dbQueries.record(scope.dbQueries);
        stats.dbMs.record(scope.dbMs);
        const statusClass = `${Math.floor(status / 100)}xx`;
        stats.status[statusClass] = (stats.status[statusClass] ?? 0) + 1;
    }

    /** One finished Mongo command, e.g. ("find", "transactions", 3.2). */
    recordDbCommand(
        command: string,
        collection: string | undefined,
        ms: number,
        failed: boolean,
    ): void {
        const key = collection ? `${command} ${collection}` : command;
        let stats = this.dbCommands.get(key);
        if (!stats) {
            stats = { latency: new LatencySeries(), failed: 0 };
            this.dbCommands.set(key, stats);
        }
        stats.latency.record(ms);
        if (failed) stats.failed += 1;
        promDb
            .labels(command, collection ?? '', String(failed))
            .observe(ms / 1000);

        const scope = requestScope.getStore();
        if (scope) {
            scope.dbQueries += 1;
            scope.dbMs += ms;
        }
    }

    /** A cache lookup or write; the key's prefix (before ":") is the label. */
    recordCache(key: string, outcome: 'hit' | 'miss' | 'write'): void {
        const prefix = key.split(':')[0]!;
        let stats = this.cache.get(prefix);
        if (!stats) {
            stats = { hits: 0, misses: 0, writes: 0 };
            this.cache.set(prefix, stats);
        }
        if (outcome === 'hit') stats.hits += 1;
        else if (outcome === 'miss') stats.misses += 1;
        else stats.writes += 1;
        promCache.labels(prefix, outcome).inc();
    }

    recordJob(
        name: string,
        ms: number,
        ok: boolean,
        result: Record<string, unknown> = {},
    ): void {
        let stats = this.jobs.get(name);
        if (!stats) {
            stats = {
                runs: 0,
                failed: 0,
                latency: new LatencySeries(),
                last: null,
            };
            this.jobs.set(name, stats);
        }
        stats.runs += 1;
        if (!ok) stats.failed += 1;
        stats.latency.record(ms);
        stats.last = { at: new Date().toISOString(), ms, result };
        promJob.labels(name, String(ok)).observe(ms / 1000);
    }

    /** One Redis call made by a store, e.g. ("cache.get", 0.4, true). */
    recordRedisCommand(op: string, ms: number, ok: boolean): void {
        let stats = this.redisOps.get(op);
        if (!stats) {
            stats = { latency: new LatencySeries(), failed: 0 };
            this.redisOps.set(op, stats);
        }
        stats.latency.record(ms);
        if (!ok) stats.failed += 1;
        promRedis.labels(op, String(ok)).observe(ms / 1000);
    }

    /** A store used Mongo for one call because Redis failed. */
    recordRedisFallback(store: string): void {
        this.redisFallbacks.set(
            store,
            (this.redisFallbacks.get(store) ?? 0) + 1,
        );
        promRedisFallback.labels(store).inc();
    }

    snapshot() {
        const elapsedMs = Date.now() - this.startedAt.getTime();
        const cpu = process.cpuUsage(this.cpuAtStart);
        const memory = process.memoryUsage();
        const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
        const ns = (value: number) =>
            Number.isNaN(value) ? 0 : round(value / 1e6);

        const totalRequests = [...this.routes.values()].reduce(
            (sum, r) => sum + r.latency.count,
            0,
        );

        return {
            since: this.startedAt.toISOString(),
            elapsedSeconds: Math.round(elapsedMs / 1000),
            requests: {
                total: totalRequests,
                perSecond: round(
                    elapsedMs > 0 ? totalRequests / (elapsedMs / 1000) : 0,
                ),
            },
            routes: Object.fromEntries(
                [...this.routes.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([label, r]) => [
                        label,
                        {
                            ...r.latency.summary(),
                            status: r.status,
                            dbQueriesPerRequest: {
                                mean: r.dbQueries.summary().meanMs,
                                max: r.dbQueries.summary().maxMs,
                            },
                            dbMsPerRequest: {
                                mean: r.dbMs.summary().meanMs,
                                p95: r.dbMs.summary().p95Ms,
                            },
                        },
                    ]),
            ),
            cache: Object.fromEntries(
                [...this.cache.entries()].map(([prefix, c]) => [
                    prefix,
                    {
                        ...c,
                        hitRatio:
                            c.hits + c.misses > 0
                                ? Math.round(
                                      (c.hits / (c.hits + c.misses)) * 100,
                                  ) / 100
                                : null,
                    },
                ]),
            ),
            db: Object.fromEntries(
                [...this.dbCommands.entries()]
                    .sort(
                        ([, a], [, b]) => b.latency.totalMs - a.latency.totalMs,
                    )
                    .map(([key, d]) => [
                        key,
                        {
                            ...d.latency.summary(),
                            totalMs: round(d.latency.totalMs),
                            failed: d.failed,
                        },
                    ]),
            ),
            jobs: Object.fromEntries(
                [...this.jobs.entries()].map(([name, j]) => [
                    name,
                    {
                        runs: j.runs,
                        failed: j.failed,
                        ...j.latency.summary(),
                        last: j.last,
                    },
                ]),
            ),
            redis: {
                commands: Object.fromEntries(
                    [...this.redisOps.entries()].map(([op, r]) => [
                        op,
                        { ...r.latency.summary(), failed: r.failed },
                    ]),
                ),
                fallbacks: Object.fromEntries(this.redisFallbacks),
            },
            eventLoop: this.loop
                ? {
                      meanMs: ns(this.loop.mean),
                      p50Ms: ns(this.loop.percentile(50)),
                      p99Ms: ns(this.loop.percentile(99)),
                      maxMs: ns(this.loop.max),
                  }
                : null,
            process: {
                uptimeSeconds: Math.round(process.uptime()),
                rssMb: mb(memory.rss),
                heapUsedMb: mb(memory.heapUsed),
                heapTotalMb: mb(memory.heapTotal),
                /** CPU time used since the reset, as a share of one core. */
                cpuPercent: round(
                    elapsedMs > 0
                        ? ((cpu.user + cpu.system) / 1000 / elapsedMs) * 100
                        : 0,
                ),
            },
        };
    }
}

export type MetricsSnapshot = ReturnType<Metrics['snapshot']>;

/** The process-wide registry. */
export const metrics = new Metrics();
