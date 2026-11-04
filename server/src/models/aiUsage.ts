/** One call to the AI provider; cached answers aren't logged (port of App\Models\AiUsage). */
import { type InferSchemaType, Schema, Types, model } from 'mongoose';

export const AI_FEATURES = ['summary', 'ask', 'explain', 'digest'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

const aiUsageSchema = new Schema(
    {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        feature: { type: String, required: true, enum: AI_FEATURES },
        provider: { type: String, required: true },
        model: { type: String, required: true },
        inputTokens: { type: Number, required: true, default: 0 },
        outputTokens: { type: Number, required: true, default: 0 },
        succeeded: { type: Boolean, required: true },
        createdAt: { type: Date, required: true },
    },
    { versionKey: false },
);

// The quota counts a user's successful calls this month.
aiUsageSchema.index({ userId: 1, succeeded: 1, createdAt: -1 });

export type AiUsageFields = InferSchemaType<typeof aiUsageSchema>;
export const AiUsage = model('AiUsage', aiUsageSchema, 'aiUsage');
