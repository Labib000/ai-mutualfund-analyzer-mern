import type {
    ClientRateLimitInfo,
    IncrementResponse,
    Options,
    Store,
} from 'express-rate-limit';

import { RateLimit } from '../models/rateLimit.js';
import { getRedis, redisFallback, timedRedis } from './redis.js';

/**
 * express-rate-limit store backed by the `rateLimits` collection, so limits
 * survive app restarts (Hostinger may restart or idle the app).
 * Fixed window: the first hit opens a window of `windowMs`; a TTL index
 * clears old documents.
 */
export class MongoRateLimitStore implements Store {
    windowMs = 60_000;
    readonly localKeys = false;

    constructor(readonly prefix: string) {}

    init(options: Options): void {
        this.windowMs = options.windowMs;
    }

    private key(key: string): string {
        return `${this.prefix}:${key}`;
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const doc = await RateLimit.findOne({ key: this.key(key) }).lean();

        if (!doc || doc.resetAt.getTime() <= Date.now()) return undefined;

        return { totalHits: doc.hits, resetTime: doc.resetAt };
    }

    async increment(key: string): Promise<IncrementResponse> {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + this.windowMs);
        const expired = { $lte: [{ $ifNull: ['$resetAt', now] }, now] };

        // One atomic upsert: restart the window if it has expired, else add a hit.
        const doc = await RateLimit.findOneAndUpdate(
            { key: this.key(key) },
            [
                {
                    $set: {
                        hits: {
                            $cond: [expired, 1, { $add: ['$hits', 1] }],
                        },
                        resetAt: { $cond: [expired, windowEnd, '$resetAt'] },
                    },
                },
            ],
            {
                upsert: true,
                returnDocument: 'after',
                lean: true,
                updatePipeline: true,
            },
        );

        return { totalHits: doc!.hits, resetTime: doc!.resetAt };
    }

    async decrement(key: string): Promise<void> {
        await RateLimit.updateOne(
            { key: this.key(key), hits: { $gt: 0 } },
            { $inc: { hits: -1 } },
        );
    }

    async resetKey(key: string): Promise<void> {
        await RateLimit.deleteOne({ key: this.key(key) });
    }
}

let redisNamespace = 'hisaab:rl:';

/** Tests: keep this file's Redis keys under their own namespace. */
export function setRateLimitNamespace(namespace: string): void {
    redisNamespace = namespace;
}

/**
 * Decrements only a counter that exists and is above 0. A plain DECR on a key
 * that just expired would create a new key with no TTL, which volatile-lru
 * never evicts, so it would stay forever. DECR keeps the key's TTL.
 */
const DECREMENT_IF_POSITIVE = `
local hits = tonumber(redis.call('GET', KEYS[1]))
if hits and hits > 0 then return redis.call('DECR', KEYS[1]) end
return -1`;

type ExecResult = [error: Error | null, result: unknown][] | null;

/** The results of a MULTI/EXEC, throwing if any command failed. */
function results(replies: ExecResult): unknown[] {
    if (!replies) throw new Error('Redis transaction was aborted');
    return replies.map(([error, result]) => {
        if (error) throw error;
        return result;
    });
}

/**
 * The same fixed window as MongoRateLimitStore, in Redis: a counter per key
 * whose TTL is the window. Every call is timed as rateLimit.<op>.
 */
export class RedisRateLimitStore implements Store {
    windowMs = 60_000;
    readonly localKeys = false;

    /** `namespace` defaults to the current one (see setRateLimitNamespace). */
    constructor(
        readonly prefix: string,
        private readonly namespace?: string,
    ) {}

    init(options: Options): void {
        this.windowMs = options.windowMs;
    }

    private key(key: string): string {
        return `${this.namespace ?? redisNamespace}${this.prefix}:${key}`;
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const k = this.key(key);
        const [hits, pttl] = results(
            await timedRedis('rateLimit.get', (redis) =>
                redis.multi().get(k).pttl(k).exec(),
            ),
        ) as [string | null, number];

        if (hits === null || pttl === -2) return undefined;

        return {
            totalHits: Number(hits),
            resetTime: new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs)),
        };
    }

    /**
     * INCR, then PEXPIRE NX (only the first hit sets the expiry, so the window
     * stays fixed instead of sliding), then PTTL, in one MULTI/EXEC.
     */
    async increment(key: string): Promise<IncrementResponse> {
        const k = this.key(key);

        return timedRedis('rateLimit.increment', async (redis) => {
            const [hits, , pttl] = results(
                await redis
                    .multi()
                    .incr(k)
                    .pexpire(k, this.windowMs, 'NX')
                    .pttl(k)
                    .exec(),
            ) as [number, number, number];

            let msLeft = pttl;
            if (msLeft < 0) {
                // No expiry (should never happen): repair it so the key can't
                // stay at the limit forever.
                await redis.pexpire(k, this.windowMs);
                msLeft = this.windowMs;
            }

            return {
                totalHits: hits,
                resetTime: new Date(Date.now() + msLeft),
            };
        });
    }

    async decrement(key: string): Promise<void> {
        const k = this.key(key);
        await timedRedis('rateLimit.decrement', (redis) =>
            redis.eval(DECREMENT_IF_POSITIVE, 1, k),
        );
    }

    async resetKey(key: string): Promise<void> {
        const k = this.key(key);
        await timedRedis('rateLimit.resetKey', (redis) => redis.unlink(k));
    }
}

/**
 * Redis while it's configured and working, else Mongo (decided per call, since
 * limiters are built before Redis connects). During an outage hits split
 * between the stores, so limits are briefly looser: failing open on purpose,
 * because a Redis outage must not lock people out of logging in.
 */
export class FallbackRateLimitStore implements Store {
    readonly localKeys = false;
    private readonly mongo: MongoRateLimitStore;
    private readonly redis: RedisRateLimitStore;

    constructor(readonly prefix: string) {
        this.mongo = new MongoRateLimitStore(prefix);
        this.redis = new RedisRateLimitStore(prefix);
    }

    init(options: Options): void {
        this.mongo.init(options);
        this.redis.init(options);
    }

    private async either<T>(
        call: (store: Store) => Promise<T> | T,
    ): Promise<T> {
        if (getRedis()) {
            try {
                return await call(this.redis);
            } catch (error) {
                redisFallback('rateLimit', error);
            }
        }
        return call(this.mongo);
    }

    get(key: string) {
        return this.either((s) => s.get!(key)) as Promise<
            ClientRateLimitInfo | undefined
        >;
    }

    increment(key: string) {
        return this.either((s) => s.increment(key));
    }

    decrement(key: string) {
        return this.either((s) => s.decrement(key));
    }

    resetKey(key: string) {
        return this.either((s) => s.resetKey(key));
    }
}

/** The store every limiter uses: Redis with a Mongo fallback. */
export function rateLimitStore(name: string): Store {
    return new FallbackRateLimitStore(name);
}
