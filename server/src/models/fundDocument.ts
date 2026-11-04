import { type InferSchemaType, Schema, Types, model } from 'mongoose';

import { DOC_TYPES } from '../rag/manifest.js';

/** A fund document that has been ingested; its text lives in docChunks. */
const fundDocumentSchema = new Schema(
    {
        /** The manifest entry's id, so a re-run finds this row. */
        manifestId: { type: String, required: true, unique: true },
        title: { type: String, required: true },
        amc: { type: String, required: true },
        docType: { type: String, required: true, enum: DOC_TYPES },
        /** "YYYY-MM-DD", shown with every citation. */
        asOfDate: { type: String, required: true },
        sourceUrl: { type: String, required: true },
        schemeIds: [{ type: Types.ObjectId, ref: 'Scheme', required: true }],
        /** Fingerprint of the PDF: unchanged means there's nothing to redo. */
        contentHash: { type: String, required: true },
    },
    { timestamps: true },
);

export type FundDocumentFields = InferSchemaType<typeof fundDocumentSchema>;

export const FundDocument = model(
    'FundDocument',
    fundDocumentSchema,
    'fundDocuments',
);
