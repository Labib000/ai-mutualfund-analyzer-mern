import { type InferSchemaType, Schema, Types, model } from 'mongoose';

export const CHUNK_KINDS = ['text', 'table'] as const;

/**
 * One searchable piece of a fund document. `schemeIds` is copied from the
 * document or its section so search can filter by fund without a join.
 */
const docChunkSchema = new Schema(
    {
        documentId: {
            type: Types.ObjectId,
            ref: 'FundDocument',
            required: true,
        },
        /** Order within the document. */
        position: { type: Number, required: true },
        schemeIds: [{ type: Types.ObjectId, ref: 'Scheme', required: true }],
        page: { type: Number, required: true },
        section: { type: String, default: null },
        kind: { type: String, required: true, enum: CHUNK_KINDS },
        text: { type: String, required: true },
        /** Left out of normal reads: it's large and only search uses it. */
        embedding: { type: [Number], required: true, select: false },
        /** Vectors from different models can't be compared. */
        embeddingModel: { type: String, required: true },
        contentHash: { type: String, required: true },
    },
    { timestamps: true },
);

docChunkSchema.index({ documentId: 1, position: 1 }, { unique: true });

export type DocChunkFields = InferSchemaType<typeof docChunkSchema>;

export const DocChunk = model('DocChunk', docChunkSchema, 'docChunks');
