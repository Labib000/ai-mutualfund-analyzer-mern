/**
 * Monthly allowance of successful AI requests per user, counted in IST
 * calendar months. Failed calls and cached answers don't count (port of App\Ai\AiQuota).
 */
import type { Types } from 'mongoose';

import { today } from '../lib/today.js';
import { AiUsage } from '../models/aiUsage.js';
import { AiQuotaExceededError } from './provider.js';

/** Midnight IST on the 1st of the current month. */
export function startOfIstMonth(): Date {
    return new Date(`${today().slice(0, 8)}01T00:00:00+05:30`);
}

export class AiQuota {
    constructor(readonly limit: number) {}

    async used(userId: Types.ObjectId): Promise<number> {
        return AiUsage.countDocuments({
            userId,
            succeeded: true,
            createdAt: { $gte: startOfIstMonth() },
        });
    }

    async remaining(userId: Types.ObjectId): Promise<number> {
        return Math.max(0, this.limit - (await this.used(userId)));
    }

    /** @throws AiQuotaExceededError */
    async ensureAvailable(userId: Types.ObjectId): Promise<void> {
        if ((await this.remaining(userId)) === 0) {
            throw new AiQuotaExceededError(
                `You've used all ${this.limit} AI requests for this month. They reset on the 1st.`,
            );
        }
    }
}
