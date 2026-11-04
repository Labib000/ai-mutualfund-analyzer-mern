/**
 * Check the RAG inputs without touching the database or any AI service.
 *   npm run rag:check
 */
import { access } from 'node:fs/promises';

import {
    QUESTION_TARGET,
    loadQuestions,
    questionProblems,
} from '../rag/evalQuestions.js';
import {
    ManifestError,
    docsUrl,
    documentCodes,
    loadManifest,
} from '../rag/manifest.js';

async function main(): Promise<number> {
    let manifest;
    try {
        manifest = await loadManifest();
    } catch (error) {
        if (error instanceof ManifestError) {
            console.error(error.message);
            return 1;
        }
        throw error;
    }

    const missing: string[] = [];
    for (const { file } of manifest.documents) {
        await access(new URL(file, docsUrl)).catch(() => missing.push(file));
    }

    const questions = await loadQuestions();
    const problems = questionProblems(questions, manifest);
    const count = (split: keyof typeof QUESTION_TARGET) =>
        questions.filter((q) => q.split === split).length;

    const { documents } = manifest;
    console.log(
        `${documents.length} documents, ${new Set(documents.map((d) => d.amc)).size} fund houses, ${new Set(documents.flatMap(documentCodes)).size} AMFI codes.`,
    );
    console.log(
        `Questions: ${count('tune')}/${QUESTION_TARGET.tune} tuning, ${count('holdout')}/${QUESTION_TARGET.holdout} held back.`,
    );

    for (const file of missing) console.error(`Missing PDF: ${file}`);
    for (const problem of problems) console.error(problem);
    return missing.length + problems.length > 0 ? 1 : 0;
}

process.exitCode = await main();
