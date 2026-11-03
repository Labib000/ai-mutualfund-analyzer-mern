import {
    type HydratedDocument,
    type InferSchemaType,
    Schema,
    Types,
    model,
} from 'mongoose';

/** A monthly SIP. Dates are "YYYY-MM-DD". */
const sipSchema = new Schema(
    {
        holdingId: {
            type: Types.ObjectId,
            ref: 'Holding',
            required: true,
            index: true,
        },
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        amountPaise: { type: Number, required: true },
        dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
        startDate: { type: String, required: true, index: true },
        endDate: { type: String, default: null },
        /** Date of the last installment recorded. */
        generatedUntil: { type: String, default: null },
    },
    { timestamps: true },
);

export type SipFields = InferSchemaType<typeof sipSchema>;
export type SipDoc = HydratedDocument<SipFields>;

export const Sip = model('Sip', sipSchema, 'sips');

/** Whether installments are still due on or after the date. */
export const isSipRunningOn = (sip: Pick<SipFields, 'endDate'>, date: string) =>
    sip.endDate === null || sip.endDate === undefined || sip.endDate >= date;

/** SIPs that may still have installments to generate up to the date (Laravel's dueBy scope). */
export function sipsDueBy(date: string) {
    return {
        startDate: { $lte: date },
        $or: [
            { generatedUntil: null },
            {
                generatedUntil: { $lt: date },
                $or: [
                    { endDate: null },
                    { $expr: { $lt: ['$generatedUntil', '$endDate'] } },
                ],
            },
        ],
    };
}
