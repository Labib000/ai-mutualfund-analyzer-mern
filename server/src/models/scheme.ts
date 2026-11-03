import { SCHEME_PLANS, SCHEME_TYPES } from '@hisaab/shared';
import {
    type HydratedDocument,
    type InferSchemaType,
    Schema,
    model,
} from 'mongoose';

/** The AMFI scheme master, refreshed by the NAV import. */
const schemeSchema = new Schema(
    {
        amfiCode: { type: Number, required: true, unique: true },
        isinGrowth: { type: String, default: null, index: true },
        isinReinvestment: { type: String, default: null },
        name: { type: String, required: true },
        amc: { type: String, required: true },
        schemeType: { type: String, required: true, enum: SCHEME_TYPES },
        category: { type: String, required: true },
        plan: { type: String, default: null, enum: [...SCHEME_PLANS, null] },
        /** 4 dp string, e.g. "29.2304". */
        latestNav: { type: String, default: null },
        /** "YYYY-MM-DD". */
        latestNavDate: { type: String, default: null },
        isActive: { type: Boolean, required: true, default: true, index: true },
        /** Set once the scheme's full NAV history is stored (see NavLookup). */
        historySyncedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

schemeSchema.index({ name: 'text' });

export type SchemeFields = InferSchemaType<typeof schemeSchema>;
export type SchemeDoc = HydratedDocument<SchemeFields>;

export const Scheme = model('Scheme', schemeSchema, 'schemes');
