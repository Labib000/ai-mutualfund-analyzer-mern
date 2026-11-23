/**
 * The optional Redis connection (Phase 4.4). One shared client per process,
 * like Mongoose's connection in db.ts.
 *
 * Redis is never required: with REDIS_URL unset, getRedis() is null and the
 * app uses Mongo for everything. When it is set, the client is tuned to fail
 * fast rather than wait, so callers (the cache, rate limits and job lock, from
 * R2 on) can fall back to Mongo the moment Redis is slow or down:
 * - it connects in the background, so the app starts even when Redis is down;
 * - while disconnected, commands fail at once instead of queueing;
 * - a command that takes longer than COMMAND_TIMEOUT_MS fails;
 * - it keeps reconnecting in the background, backing off up to 5 s.
 */
import { Redis } from 'ioredis';

import type { Logger } from './logger.js';
import { metrics } from './metrics.js';

export type RedisStatus = 'up' | 'down' | 'disabled';

const CONNECT_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5_000;
/** While Redis stays down, log its error at most this often. */
const ERROR_LOG_INTERVAL_MS = 60_000;

let client: Redis | null = null;
let log: Logger | undefined;

/**
 * Creates the shared client and starts connecting without waiting for it.
 * Replaces (and closes) any previous client.
 */
export function connectRedis(url: string, logger?: Logger): Redis {
    if (client) client.disconnect();
    log = logger;

    const redis = new Redis(url, {
        lazyConnect: true,
        connectTimeout: CONNECT_TIMEOUT_MS,
        commandTimeout: COMMAND_TIMEOUT_MS,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) =>
            Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
    });

    let failing = false;
    let lastLoggedAt = 0;

    // Without an 'error' listener, ioredis reports every failed reconnect as
    // an unhandled error. Log the first one, then at most once a minute.
    redis.on('error', (error: Error & { code?: string }) => {
        const now = Date.now();
        if (!failing || now - lastLoggedAt >= ERROR_LOG_INTERVAL_MS) {
            logger?.warn(
                // A dropped connection can come with an empty message.
                { err: error.message || error.code || error.name },
                failing ? 'Redis still unavailable' : 'Redis unavailable',
            );
            lastLoggedAt = now;
        }
        failing = true;
    });

    redis.on('ready', () => {
        logger?.info(failing ? 'Redis reconnected' : 'Redis connected');
        failing = false;
    });

    // Errors go to the listener above; reconnecting is retryStrategy's job.
    redis.connect().catch(() => {});

    client = redis;
    return redis;
}

/** The shared client, or null when Redis isn't configured. */
export function getRedis(): Redis | null {
    return client;
}

/** Closes the shared client: politely (QUIT) if connected, else at once. */
export async function disconnectRedis(): Promise<void> {
    const redis = client;
    if (!redis) return;
    client = null;

    if (redis.status === 'ready') {
        try {
            await redis.quit();
            return;
        } catch {
            // Fall through to a hard disconnect.
        }
    }
    redis.disconnect();
}

/**
 * Runs one Redis call for a store and records its latency (as `op`, e.g.
 * "cache.get") in the metrics. Rethrows failures so the store can fall back.
 */
export async function timedRedis<T>(
    op: string,
    call: (redis: Redis) => Promise<T>,
): Promise<T> {
    const redis = client;
    if (!redis) throw new Error('Redis is not configured');

    const started = process.hrtime.bigint();
    let ok = false;
    try {
        const result = await call(redis);
        ok = true;
        return result;
    } finally {
        metrics.recordRedisCommand(
            op,
            Number(process.hrtime.bigint() - started) / 1e6,
            ok,
        );
    }
}

/** When each store last logged a fallback, to log at most once a minute. */
const fallbackLoggedAt = new Map<string, number>();

/**
 * A store is about to use Mongo for one call because Redis failed: count it
 * (hisaab_redis_fallback_total) and log it, at most once a minute per store.
 */
export function redisFallback(store: string, error: unknown): void {
    metrics.recordRedisFallback(store);

    const now = Date.now();
    if (now - (fallbackLoggedAt.get(store) ?? 0) >= ERROR_LOG_INTERVAL_MS) {
        fallbackLoggedAt.set(store, now);
        const err = error as (Error & { code?: string }) | undefined;
        log?.warn(
            { store, err: err?.message || err?.code || String(error) },
            'Redis failed; using Mongo',
        );
    }
}

/**
 * Waits until the shared client is connected. For CLI scripts, which run one
 * command right away; the server doesn't wait (early calls fall back).
 */
export async function waitForRedis(timeoutMs = 5_000): Promise<boolean> {
    const redis = client;
    if (!redis) return false;
    if (redis.status === 'ready') return true;

    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            redis.off('ready', onReady);
            resolve(false);
        }, timeoutMs);
        const onReady = () => {
            clearTimeout(timer);
            resolve(true);
        };
        redis.once('ready', onReady);
    });
}

/** "up" when Redis answers PING, "down" when it doesn't, "disabled" when not configured. */
export async function redisStatus(): Promise<RedisStatus> {
    const redis = client;
    if (!redis) return 'disabled';

    try {
        return (await redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
        return 'down';
    }
}
