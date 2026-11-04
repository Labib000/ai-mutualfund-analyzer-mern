import { describe, expect, it } from 'vitest';

import {
    type EvalQuestion,
    loadQuestions,
    questionProblems,
} from '../../src/rag/evalQuestions.js';
import { type Manifest, parseManifest } from '../../src/rag/manifest.js';

const manifest: Manifest = parseManifest({
    version: 1,
    documents: [
        {
            id: 'kim-one',
            title: 'KIM: One Fund',
            amc: 'One Mutual Fund',
            docType: 'kim',
            asOfDate: '2026-09-30',
            sourceUrl: 'https://example.com/one.pdf',
            file: 'kim-one.pdf',
            amfiCodes: [100],
        },
    ],
});

const question = (overrides: Partial<EvalQuestion> = {}): EvalQuestion => ({
    id: 'q1',
    split: 'tune',
    kind: 'fact',
    question: 'What is the exit load?',
    amfiCode: 100,
    expectedRoute: 'document',
    expectedAnswer: '1% within a year',
    source: { documentId: 'kim-one', page: 4 },
    ...overrides,
});

describe('RAG test questions', () => {
    it('accepts a complete question', () => {
        expect(questionProblems([question()], manifest)).toEqual([]);
    });

    it('accepts a question with no answer in the documents', () => {
        expect(
            questionProblems(
                [
                    question({
                        kind: 'not_found',
                        expectedAnswer: null,
                        source: null,
                    }),
                ],
                manifest,
            ),
        ).toEqual([]);
    });

    it('finds repeated ids', () => {
        expect(questionProblems([question(), question()], manifest)).toEqual([
            'id "q1" is used twice',
        ]);
    });

    it('finds a source that is not in the manifest', () => {
        expect(
            questionProblems(
                [question({ source: { documentId: 'nope', page: 1 } })],
                manifest,
            ),
        ).toEqual(['q1: no document "nope" in the manifest']);
    });

    it('finds a fact with no answer key', () => {
        expect(
            questionProblems([question({ source: null })], manifest),
        ).toEqual(['q1: needs a source and an expected answer']);
    });

    it('finds a not_found question that has an answer', () => {
        expect(
            questionProblems([question({ kind: 'not_found' })], manifest),
        ).toEqual(["q1: not_found can't have a source or answer"]);
    });

    it('finds a portfolio question routed to documents', () => {
        expect(
            questionProblems(
                [
                    question({
                        kind: 'portfolio',
                        expectedRoute: 'document',
                        source: null,
                    }),
                ],
                manifest,
            ),
        ).toEqual(['q1: a portfolio question must route there']);
    });

    it('loads the real file', async () => {
        await expect(loadQuestions()).resolves.toBeInstanceOf(Array);
    });
});
