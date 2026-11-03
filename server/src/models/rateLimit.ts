import { Schema, model } from 'mongoose';

/** Fixed-window hit counters for express-rate-limit (see lib/rateLimitStore). */
const rateLimitSchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        hits: { type: Number, required: true },
        resetAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false },
);

export const RateLimit = model('RateLimit', rateLimitSchema, 'rateLimits');
