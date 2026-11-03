import {
    type HydratedDocument,
    type InferSchemaType,
    Schema,
    Types,
    model,
} from 'mongoose';

/** A fund in a user's portfolio. Its SIPs and transactions are separate collections. */
const holdingSchema = new Schema(
    {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        schemeId: { type: Types.ObjectId, ref: 'Scheme', required: true },
        /**
         * Bumped as the first write of every transaction that changes the
         * holding's units, so concurrent writers conflict and one retries
         * (stands in for Laravel's lockForUpdate). See lockHolding().
         */
        version: { type: Number, required: true, default: 0 },
    },
    { timestamps: true },
);

holdingSchema.index({ userId: 1, schemeId: 1 }, { unique: true });

export type HoldingFields = InferSchemaType<typeof holdingSchema>;
export type HoldingDoc = HydratedDocument<HoldingFields>;

export const Holding = model('Holding', holdingSchema, 'holdings');
