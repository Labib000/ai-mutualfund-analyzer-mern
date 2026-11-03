import { Schema, model } from 'mongoose';

/**
 * One document per running job, so two cron calls can't overlap
 * (Laravel's withoutOverlapping). The TTL index clears locks left by a crash.
 */
const jobLockSchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        owner: { type: String, required: true },
        expiresAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false },
);

export const JobLock = model('JobLock', jobLockSchema, 'jobLocks');
