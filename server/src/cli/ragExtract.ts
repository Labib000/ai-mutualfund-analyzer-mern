/**
 * Write each manifest document's text to server/rag/docs/text, to read while
 * writing test questions and to spot pages that extract badly.
 *   npm run rag:extract
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { docsUrl, loadManifest } from '../rag/manifest.js';
import { extractPages } from '../rag/pdfText.js';

const textUrl = new URL('text/', docsUrl);

async function main(): Promise<number> {
    const { documents } = await loadManifest();
    await mkdir(textUrl, { recursive: true });

    for (const { id, file } of documents) {
        const pages = await extractPages(
            new Uint8Array(await readFile(new URL(file, docsUrl))),
        );
        const blank = pages.filter((p) => p.text === '').length;

        await writeFile(
            new URL(`${id}.txt`, textUrl),
            pages.map((p) => `--- page ${p.page} ---\n${p.text}`).join('\n\n'),
        );
        console.log(`${id}: ${pages.length} pages, ${blank} with no text`);
    }
    return 0;
}

process.exitCode = await main();
