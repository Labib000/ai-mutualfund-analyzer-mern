/**
 * The hand-written test questions (server/rag/eval/questions.json): the answer
 * key RAG is scored against. Questions marked "holdout" stay unused until the
 * final run, so that score isn't flattered by tuning.
 */
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import type { Manifest } from './manifest.js';

export const QUESTION_KINDS = [
    'fact',
    'table',
    'not_found',
    'portfolio',
    'mixed',
    'follow_up',
] as const;

const QUESTIONS_URL = new URL('../../rag/eval/questions.json', import.meta.url);

/** The planned set: 40 for tuning and 20 held back. */
export const QUESTION_TARGET = { tune: 40, holdout: 20 } as const;

const sourceSchema = z.object({
    documentId: z.string().min(1),
    page: z.number().int().positive(),
});

const questionSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    split: z.enum(['tune', 'holdout']),
    kind: z.enum(QUESTION_KINDS),
    question: z.string().trim().min(1),
    /** The fund meant, when the question names one. */
    amfiCode: z.number().int().positive().nullable(),
    expectedRoute: z.enum(['portfolio', 'document', 'both']),
    /** What a correct answer must say; null when it should say "not found". */
    expectedAnswer: z.string().trim().min(1).nullable(),
    /** Where the answer is printed; null when no document holds it. */
    source: sourceSchema.nullable(),
});

const questionFileSchema = z.object({
    version: z.literal(1),
    questions: z.array(questionSchema),
});

export type EvalQuestion = z.output<typeof questionSchema>;

/** Mistakes that a schema can't see, such as a source that doesn't exist. */
export function questionProblems(
    questions: EvalQuestion[],
    manifest: Manifest,
): string[] {
    const documentIds = new Set(manifest.documents.map((d) => d.id));
    const ids = new Set<string>();
    const problems: string[] = [];

    for (const q of questions) {
        if (ids.has(q.id)) problems.push(`id "${q.id}" is used twice`);
        ids.add(q.id);

        if (q.source && !documentIds.has(q.source.documentId)) {
            problems.push(
                `${q.id}: no document "${q.source.documentId}" in the manifest`,
            );
        }
        if (q.kind === 'not_found' && (q.source || q.expectedAnswer)) {
            problems.push(`${q.id}: not_found can't have a source or answer`);
        }
        if (q.kind === 'portfolio' && q.expectedRoute !== 'portfolio') {
            problems.push(`${q.id}: a portfolio question must route there`);
        }
        if (
            (q.kind === 'fact' || q.kind === 'table') &&
            !(q.source && q.expectedAnswer)
        ) {
            problems.push(`${q.id}: needs a source and an expected answer`);
        }
    }
    return problems;
}

/** @throws when the file is malformed */
export async function loadQuestions(
    url: URL = QUESTIONS_URL,
): Promise<EvalQuestion[]> {
    return questionFileSchema.parse(JSON.parse(await readFile(url, 'utf8')))
        .questions;
}
