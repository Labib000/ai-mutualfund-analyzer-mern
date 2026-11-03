import { Schema, model } from 'mongoose';

/**
 * Key-value cache (Laravel's database cache): the value history now, later
 * the AI summary, fund explanations and scheme stats. The TTL index drops
 * expired entries.
 */
const cacheEntrySchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false, minimize: false },
);

export const CacheEntry = model('CacheEntry', cacheEntrySchema, 'cache');
