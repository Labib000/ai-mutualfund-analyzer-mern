import { type InferSchemaType, Schema, Types, model } from 'mongoose';

/** Daily NAVs, kept only for schemes someone has used (see NavLookup). */
const navHistorySchema = new Schema(
    {
        schemeId: { type: Types.ObjectId, ref: 'Scheme', required: true },
        /** "YYYY-MM-DD". */
        navDate: { type: String, required: true },
        /** 4 dp string. */
        nav: { type: String, required: true },
    },
    { versionKey: false },
);

navHistorySchema.index({ schemeId: 1, navDate: 1 }, { unique: true });

export type NavHistoryFields = InferSchemaType<typeof navHistorySchema>;

export const NavHistory = model('NavHistory', navHistorySchema, 'navHistory');
