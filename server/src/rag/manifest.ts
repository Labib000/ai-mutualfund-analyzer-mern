/**
 * The list of fund documents RAG ingests (server/rag/manifest.json). A wrong
 * entry here makes the app quote the wrong fund, so loading it checks more
 * than the shape: unique ids, and that no fund shares pages or codes with
 * another inside a document.
 */
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { isIsoDate } from '../lib/dates.js';

export const DOC_TYPES = ['kim', 'factsheet', 'sid'] as const;
export type DocType = (typeof DOC_TYPES)[number];

const MANIFEST_URL = new URL('../../rag/manifest.json', import.meta.url);

const amfiCodes = z
    .array(z.number().int().positive())
    .min(1, 'lists no AMFI codes');

const sectionSchema = z
    .object({
        fund: z.string().trim().min(1),
        startPage: z.number().int().positive(),
        endPage: z.number().int().positive(),
        amfiCodes,
    })
    .refine((s) => s.startPage <= s.endPage, {
        error: 'ends before it starts',
    });

const documentSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        title: z.string().trim().min(1),
        amc: z.string().trim().min(1),
        docType: z.enum(DOC_TYPES),
        asOfDate: z.string().refine(isIsoDate, 'must be YYYY-MM-DD'),
        sourceUrl: z.url(),
        /** A bare name in server/rag/docs, so an entry can't point outside it. */
        file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
        /** The funds a whole-document entry covers, e.g. every plan in a KIM. */
        amfiCodes: amfiCodes.optional(),
        /** The pages of each fund, for a factsheet that covers many. */
        sections: z.array(sectionSchema).min(1).optional(),
    })
    .refine((d) => (d.amfiCodes === undefined) !== (d.sections === undefined), {
        error: 'needs either amfiCodes or sections, not both',
    });

const manifestSchema = z.object({
    version: z.literal(1),
    documents: z.array(documentSchema).min(1),
});

export type ManifestDocument = z.output<typeof documentSchema>;
export type Manifest = z.output<typeof manifestSchema>;

/** The manifest is wrong. `problems` lists every mistake, not just the first. */
export class ManifestError extends Error {
    override name = 'ManifestError';

    constructor(readonly problems: string[]) {
        super(`Invalid RAG manifest:\n- ${problems.join('\n- ')}`);
    }
}

function repeated<T>(values: T[]): T[] {
    const seen = new Set<T>();
    return [...new Set(values.filter((v) => seen.size === seen.add(v).size))];
}

/** Two funds claiming a page or a code would mix up their answers. */
function sectionProblems(document: ManifestDocument): string[] {
    const sections = [...(document.sections ?? [])].sort(
        (a, b) => a.startPage - b.startPage,
    );
    const problems: string[] = [];

    sections.forEach((section, i) => {
        const next = sections[i + 1];
        if (next && next.startPage <= section.endPage) {
            problems.push(
                `${document.id}: "${section.fund}" overlaps "${next.fund}" on page ${next.startPage}`,
            );
        }
    });
    for (const code of repeated(sections.flatMap((s) => s.amfiCodes))) {
        problems.push(`${document.id}: AMFI code ${code} is in two sections`);
    }
    return problems;
}

/** @throws ManifestError */
export function parseManifest(input: unknown): Manifest {
    const result = manifestSchema.safeParse(input);
    if (!result.success) {
        throw new ManifestError(
            result.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
            ),
        );
    }

    const { documents } = result.data;
    const problems = [
        ...repeated(documents.map((d) => d.id)).map(
            (id) => `id "${id}" is used twice`,
        ),
        ...repeated(documents.map((d) => d.file)).map(
            (file) => `file "${file}" is used twice`,
        ),
        ...documents.flatMap(sectionProblems),
    ];
    if (problems.length > 0) throw new ManifestError(problems);
    return result.data;
}

/** @throws ManifestError */
export async function loadManifest(url: URL = MANIFEST_URL): Promise<Manifest> {
    return parseManifest(JSON.parse(await readFile(url, 'utf8')));
}

/** Every AMFI code a document covers, in either form. */
export function documentCodes(document: ManifestDocument): number[] {
    const codes =
        document.amfiCodes ??
        (document.sections ?? []).flatMap((s) => s.amfiCodes);
    return [...new Set(codes)];
}

export const docsUrl = new URL('../../rag/docs/', import.meta.url);
