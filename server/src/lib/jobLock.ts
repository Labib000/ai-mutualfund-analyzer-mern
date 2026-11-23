/**
 * Job locks, so two cron calls (or a cron call and a CLI run) can't run the
 * same job at once (Laravel's withoutOverlapping).
 *
 * The lock lives in Redis when REDIS_URL is set (R4), else in Mongo. Unlike
 * the cache and rate limits there is NO per-call fallback: a lock only works
 * if every run asks the same store. If run A holds the lock in Redis and run B
 * fell back to Mongo during a blip, B would find no lock and both would run.
 * So with Redis configured but unreachable, the lock **fails closed**: the job
 * is skipped (JobLockUnavailableError) and the next cron call tries again.
 */
import { randomUUID } from 'node:crypto';

import { JobLock } from '../models/jobLock.js';
import { getRedis, timedRedis, waitForRedis, warnRedis } from './redis.js';

export class JobLockedError extends Error {
    override name = 'JobLockedError';

    constructor(readonly key: string) {
        super(`Job "${key}" is already running.`);
    }
}

/** Redis is configured but couldn't be asked for the lock. */
export class JobLockUnavailableError extends Error {
    override name = 'JobLockUnavailableError';

    constructor(
        readonly key: string,
        options?: { cause?: unknown },
    ) {
        super(
            `Job "${key}" was skipped: the lock store (Redis) is unavailable. It will run on the next call.`,
            options,
        );
    }
}

export interface JobLockStore {
    /** Takes the lock for `owner`; false when someone else holds it. */
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;
    /** Releases the lock, but only if `owner` still holds it. */
    release(key: string, owner: string): Promise<void>;
}

function isDuplicateKey(error: unknown): boolean {
    return (error as { code?: number })?.code === 11000;
}

/** One `jobLocks` document per running job; a TTL index clears crashed runs. */
export const mongoJobLockStore: JobLockStore = {
    async acquire(key, owner, ttlMs) {
        // Takes over an expired lock the TTL monitor hasn't removed yet (it
        // runs every 60 s). A live lock makes the upsert hit the unique index.
        try {
            await JobLock.findOneAndUpdate(
                { key, expiresAt: { $lte: new Date() } },
                { $set: { owner, expiresAt: new Date(Date.now() + ttlMs) } },
                { upsert: true },
            );
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) return false;
            throw error;
        }
    },

    async release(key, owner) {
        await JobLock.deleteOne({ key, owner });
    },
};

/**
 * Deletes the lock only if it still holds our owner token, in one atomic
 * step. A plain GET-then-DEL could delete a lock that expired and was taken by
 * another run in between.
 */
const RELEASE_IF_OWNER = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0`;

/** How long to wait for Redis when a cron request has just woken the app. */
const CONNECT_WAIT_MS = 2_000;

/** `SET key owner NX PX ttl` to take the lock; Lua compare-and-delete to release. */
export class RedisJobLockStore implements JobLockStore {
    /** `namespace` defaults to the current one (see setJobLockNamespace). */
    constructor(private readonly namespace?: string) {}

    private key(key: string): string {
        return `${this.namespace ?? lockNamespace}${key}`;
    }

    async acquire(key: string, owner: string, ttlMs: number) {
        // The host may start the app on the cron request itself, before Redis
        // has connected; give it a moment rather than skipping the job.
        if (getRedis()?.status !== 'ready') await waitForRedis(CONNECT_WAIT_MS);

        const reply = await timedRedis('lock.acquire', (redis) =>
            redis.set(this.key(key), owner, 'PX', ttlMs, 'NX'),
        );
        return reply === 'OK';
    }

    async release(key: string, owner: string) {
        await timedRedis('lock.release', (redis) =>
            redis.eval(RELEASE_IF_OWNER, 1, this.key(key), owner),
        );
    }
}

let lockNamespace = 'hisaab:lock:';

/** Tests: keep this file's Redis keys under their own namespace. */
export function setJobLockNamespace(namespace: string): void {
    lockNamespace = namespace;
}

/**
 * Runs `fn` while holding a lock on `key`. The lock expires after
 * `ttlMinutes`, so a crashed run can't block the job forever.
 *
 * @throws JobLockedError when another run holds the lock
 * @throws JobLockUnavailableError when Redis is configured but unreachable
 */
export async function withJobLock<T>(
    key: string,
    ttlMinutes: number,
    fn: () => Promise<T>,
): Promise<T> {
    const store = getRedis() ? new RedisJobLockStore() : mongoJobLockStore;
    const owner = randomUUID();
    const ttlMs = ttlMinutes * 60_000;

    let acquired: boolean;
    try {
        acquired = await store.acquire(key, owner, ttlMs);
    } catch (error) {
        if (store === mongoJobLockStore) throw error;
        throw new JobLockUnavailableError(key, { cause: error });
    }
    if (!acquired) throw new JobLockedError(key);

    try {
        return await fn();
    } finally {
        await release(store, key, owner);
    }
}

/**
 * A Redis release failure is only logged: it mustn't hide the job's own result
 * or error, and the lock expires by itself. A Mongo one throws, as before R4.
 */
async function release(store: JobLockStore, key: string, owner: string) {
    try {
        await store.release(key, owner);
    } catch (error) {
        if (store === mongoJobLockStore) throw error;
        warnRedis('jobLock', `Could not release job lock "${key}"`, error);
    }
}
