import { cacheForget, cacheForgetPrefix } from '../lib/cache.js';
import { AiUsage } from '../models/aiUsage.js';
import { Avatar } from '../models/avatar.js';
import { Holding } from '../models/holding.js';
import { PasswordResetToken } from '../models/passwordResetToken.js';
import { Sip } from '../models/sip.js';
import { Transaction } from '../models/transaction.js';
import type { UserDoc } from '../models/user.js';

/**
 * Removes everything stored for a user, except the user document itself:
 * the caller deletes that last, so a failure here can be retried.
 */
export async function deleteUserData(user: UserDoc): Promise<void> {
    const userId = user._id;
    const id = user.id as string;

    await Promise.all([
        Transaction.deleteMany({ userId }),
        Sip.deleteMany({ userId }),
        Holding.deleteMany({ userId }),
        AiUsage.deleteMany({ userId }),
        Avatar.deleteOne({ userId }),
        PasswordResetToken.deleteOne({ email: user.email }),
        // Cached AI answers and value history quote the user's own figures.
        // Cleared from Mongo and Redis; if Redis is configured but down this
        // throws, so the account isn't deleted and the user can retry, rather
        // than leaving their figures behind in Redis.
        cacheForget([`ai-summary:${id}`, `portfolio-history:${id}`]),
        cacheForgetPrefix(`ai-digest:${id}:`),
    ]);
}
