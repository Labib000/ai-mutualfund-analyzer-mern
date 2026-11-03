import { randomUUID } from 'node:crypto';

import { JobLock } from '../models/jobLock.js';

export class JobLockedError extends Error {
    override name = 'JobLockedError';

    constructor(readonly key: string) {
        super(`Job "${key}" is already running.`);
    }
}

function isDuplicateKey(error: unknown): boolean {
    return (error as { code?: number })?.code === 11000;
}

/**
 * Runs `fn` while holding a lock on `key` (Laravel's withoutOverlapping).
 * The lock expires after `ttlMinutes`, so a crashed run can't block the job forever.
 *
 * @throws JobLockedError when another run holds the lock
 */
export async function withJobLock<T>(
    key: string,
    ttlMinutes: number,
    fn: () => Promise<T>,
): Promise<T> {
    const owner = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    // Take over an expired lock the TTL monitor hasn't removed yet (it runs every 60 s).
    try {
        await JobLock.findOneAndUpdate(
            { key, expiresAt: { $lte: new Date() } },
            { $set: { owner, expiresAt } },
            { upsert: true },
        );
    } catch (error) {
        if (isDuplicateKey(error)) throw new JobLockedError(key);
        throw error;
    }

    try {
        return await fn();
    } finally {
        await JobLock.deleteOne({ key, owner });
    }
}
