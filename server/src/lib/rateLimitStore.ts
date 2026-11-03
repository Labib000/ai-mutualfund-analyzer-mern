import type {
    ClientRateLimitInfo,
    IncrementResponse,
    Options,
    Store,
} from 'express-rate-limit';

import { RateLimit } from '../models/rateLimit.js';

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
