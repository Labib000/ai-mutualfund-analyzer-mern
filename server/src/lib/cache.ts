/** get/put over the `cache` collection, like Laravel's Cache facade. */
import { CacheEntry } from '../models/cacheEntry.js';

/** The cached value, or undefined when missing or expired. */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
    // Expiry is real time, not the app's (test-frozen) clock, because the TTL
    // monitor deletes by real time too. It runs once a minute, so check here.
    const entry = await CacheEntry.findOne({
        key,
        expiresAt: { $gt: new Date() },
    }).lean();
    return entry ? (entry.value as T) : undefined;
}

export async function cachePut(
    key: string,
    value: unknown,
    ttlSeconds: number,
): Promise<void> {
    await CacheEntry.updateOne(
        { key },
        {
            $set: {
                value,
                expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            },
        },
        { upsert: true },
    );
}
