import { TRANSACTION_TYPES } from '@hisaab/shared';
import {
    type HydratedDocument,
    type InferSchemaType,
    Schema,
    Types,
    model,
} from 'mongoose';

/** A purchase, SIP installment or redemption. Dates are "YYYY-MM-DD"; NAV and units are exact strings. */
const transactionSchema = new Schema(
    {
        holdingId: { type: Types.ObjectId, ref: 'Holding', required: true },
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        sipId: { type: Types.ObjectId, ref: 'Sip', default: undefined },
        type: { type: String, required: true, enum: TRANSACTION_TYPES },
        txnDate: { type: String, required: true },
        navDate: { type: String, required: true },
        /** 4 dp. */
        nav: { type: String, required: true },
        amountPaise: { type: Number, required: true },
        stampDutyPaise: { type: Number, required: true, default: 0 },
        /** 3 dp. */
        units: { type: String, required: true },
        unitsOverridden: { type: Boolean, required: true, default: false },
    },
    { timestamps: true },
);

transactionSchema.index({ holdingId: 1, txnDate: 1 });
// An installment can't be recorded twice.
transactionSchema.index(
    { sipId: 1, txnDate: 1 },
    { unique: true, partialFilterExpression: { sipId: { $exists: true } } },
);

export type TransactionFields = InferSchemaType<typeof transactionSchema>;
export type TransactionDoc = HydratedDocument<TransactionFields>;

export const Transaction = model(
    'Transaction',
    transactionSchema,
    'transactions',
);
