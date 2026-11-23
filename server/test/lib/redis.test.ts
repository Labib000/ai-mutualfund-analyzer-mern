import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../../src/lib/logger.js';
import { metrics, promRegistry } from '../../src/lib/metrics.js';
import {
    connectRedis,
    disconnectRedis,
    getRedis,
    redisStatus,
    timedRedis,
} from '../../src/lib/redis.js';
import { makeTestApp } from '../support/app.js';
import { useTestDb } from '../support/db.js';

/** Real Redis for the cases below; set it to run them (CI does). */
const REDIS_URL = process.env.REDIS_URL;

/** Nothing listens on port 1, so connections are refused at once. */
const NOWHERE = 'redis://127.0.0.1:1';

describe('Redis connection', () => {
    useTestDb();
    beforeEach(() => metrics.reset());
    afterEach(() => disconnectRedis());

    it('is disabled until connected', async () => {
        expect(getRedis()).toBeNull();
        expect(await redisStatus()).toBe('disabled');
    });

    it('reports down quickly when Redis is unreachable', async () => {
        connectRedis(NOWHERE);

        const started = Date.now();
        expect(await redisStatus()).toBe('down');
        expect(Date.now() - started).toBeLessThan(1_000);
    });

    it('keeps health at 200 ok when Redis is down', async () => {
        connectRedis(NOWHERE);

        const res = await request(makeTestApp().app)
            .get('/api/health')
            .expect(200);

        expect(res.body).toMatchObject({
            status: 'ok',
            db: 'up',
            redis: 'down',
        });
    });

    it('logs a readable error once when Redis is unreachable', async () => {
        const warn = vi.fn();
        connectRedis(NOWHERE, { warn, info: vi.fn() } as unknown as Logger);

        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
        const [fields, message] = warn.mock.calls[0]!;
        expect(message).toBe('Redis unavailable');
        expect((fields as { err: string }).err).not.toBe('');

        // Reconnect attempts keep failing, but aren't logged again within a minute.
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('records failed Redis calls and rethrows them, for fallbacks', async () => {
        connectRedis(NOWHERE);

        await expect(
            timedRedis('cache.get', (redis) => redis.get('k')),
        ).rejects.toThrow();
        metrics.recordRedisFallback('cache');

        const snapshot = metrics.snapshot();
        expect(snapshot.redis.commands['cache.get']).toMatchObject({
            count: 1,
            failed: 1,
        });
        expect(snapshot.redis.fallbacks).toEqual({ cache: 1 });

        const text = await promRegistry.metrics();
        expect(text).toMatch(
            /hisaab_redis_command_duration_seconds_count\{op="cache.get",ok="false"\} [1-9]/,
        );
        expect(text).toMatch(
            /hisaab_redis_fallback_total\{store="cache"\} [1-9]/,
        );
    });

    it('refuses timed calls when Redis is not configured', async () => {
        await expect(
            timedRedis('cache.get', (redis) => redis.get('k')),
        ).rejects.toThrow('Redis is not configured');
    });

    it('is disabled again after disconnecting', async () => {
        connectRedis(NOWHERE);
        await disconnectRedis();

        expect(getRedis()).toBeNull();
        expect(await redisStatus()).toBe('disabled');
    });

    describe.skipIf(!REDIS_URL)('with a real Redis (REDIS_URL)', () => {
        /** Waits for the background connection. */
        const connected = async () => {
            const redis = connectRedis(REDIS_URL!);
            if (redis.status !== 'ready') {
                await new Promise<void>((resolve, reject) => {
                    redis.once('ready', resolve);
                    setTimeout(
                        () => reject(new Error('Redis did not connect')),
                        5_000,
                    ).unref();
                });
            }
            return redis;
        };

        it('answers PING and reports up', async () => {
            await connected();
            expect(await redisStatus()).toBe('up');
        });

        it('stores, expires and deletes a key', async () => {
            const redis = await connected();
            const key = `test:r1:${Date.now()}`;

            await redis.set(key, 'hisaab', 'PX', 60_000);
            expect(await redis.get(key)).toBe('hisaab');
            expect(await redis.pttl(key)).toBeGreaterThan(0);

            await redis.del(key);
            expect(await redis.get(key)).toBeNull();
        });

        it('times successful calls', async () => {
            await connected();

            expect(await timedRedis('ping', (redis) => redis.ping())).toBe(
                'PONG',
            );
            expect(metrics.snapshot().redis.commands['ping']).toMatchObject({
                count: 1,
                failed: 0,
            });
        });

        it('reports redis up in /api/health', async () => {
            await connected();

            const res = await request(makeTestApp().app)
                .get('/api/health')
                .expect(200);

            expect(res.body).toMatchObject({ status: 'ok', redis: 'up' });
        });
    });
});
