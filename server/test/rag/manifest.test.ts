import { describe, expect, it } from 'vitest';

import {
    ManifestError,
    documentCodes,
    loadManifest,
    parseManifest,
} from '../../src/rag/manifest.js';

const section = (
    fund: string,
    startPage: number,
    endPage: number,
    code: number,
) => ({
    fund,
    startPage,
    endPage,
    amfiCodes: [code],
});

const document = (overrides: Record<string, unknown> = {}) => ({
    id: 'kim-one',
    title: 'KIM: One Fund',
    amc: 'One Mutual Fund',
    docType: 'kim',
    asOfDate: '2026-09-30',
    sourceUrl: 'https://example.com/one.pdf',
    file: 'kim-one.pdf',
    amfiCodes: [100],
    ...overrides,
});

const factsheet = (sections: unknown[]) =>
    document({
        id: 'fs',
        file: 'fs.pdf',
        docType: 'factsheet',
        amfiCodes: undefined,
        sections,
    });

const manifest = (...documents: unknown[]) => ({ version: 1, documents });

function problemsOf(input: unknown): string[] {
    try {
        parseManifest(input);
    } catch (error) {
        if (error instanceof ManifestError) return error.problems;
        throw error;
    }
    return [];
}

describe('RAG manifest', () => {
    it('accepts whole documents and per-fund sections', () => {
        const parsed = parseManifest(
            manifest(
                document(),
                factsheet([section('A', 1, 3, 1), section('B', 4, 6, 2)]),
            ),
        );

        expect(parsed.documents.map(documentCodes)).toEqual([[100], [1, 2]]);
    });

    it('stops two funds sharing a page', () => {
        expect(
            problemsOf(
                manifest(
                    factsheet([section('A', 8, 9, 1), section('B', 9, 10, 2)]),
                ),
            ),
        ).toEqual(['fs: "A" overlaps "B" on page 9']);
    });

    it('stops one code appearing under two funds', () => {
        expect(
            problemsOf(
                manifest(
                    factsheet([section('A', 1, 1, 7), section('B', 2, 2, 7)]),
                ),
            ),
        ).toEqual(['fs: AMFI code 7 is in two sections']);
    });

    it('stops repeated ids and files', () => {
        expect(problemsOf(manifest(document(), document()))).toEqual([
            'id "kim-one" is used twice',
            'file "kim-one.pdf" is used twice',
        ]);
    });

    it('needs exactly one way of naming the funds', () => {
        expect(
            problemsOf(manifest(document({ amfiCodes: undefined }))),
        ).toEqual([
            'documents.0: needs either amfiCodes or sections, not both',
        ]);
        expect(
            problemsOf(
                manifest(document({ sections: [section('A', 1, 1, 1)] })),
            ),
        ).toHaveLength(1);
    });

    it('rejects a page range that ends before it starts', () => {
        expect(
            problemsOf(manifest(factsheet([section('A', 5, 4, 1)]))),
        ).toEqual(['documents.0.sections.0: ends before it starts']);
    });

    it('keeps files inside the docs folder', () => {
        expect(
            problemsOf(manifest(document({ file: '../secret.pdf' }))),
        ).toHaveLength(1);
    });

    it('rejects dates that are not real days', () => {
        expect(
            problemsOf(manifest(document({ asOfDate: '2026-02-30' }))),
        ).toHaveLength(1);
    });

    it('passes on the real manifest', async () => {
        const { documents } = await loadManifest();

        expect(
            new Set(documents.map((d) => d.amc)).size,
        ).toBeGreaterThanOrEqual(5);
    });
});
