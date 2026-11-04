import { describe, expect, it } from 'vitest';

import { extractPages } from '../../src/rag/pdfText.js';

type Text = { x: number; y: number; text: string };

/** A tiny real PDF, one array of placed text per page. */
function pdf(pages: Text[][]): Uint8Array {
    const objects: string[] = [];
    const font = 3 + pages.length * 2;
    const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    pages.forEach((texts, i) => {
        const stream = texts
            .map(
                (t) =>
                    `BT /F1 10 Tf 1 0 0 1 ${t.x} ${t.y} Tm (${t.text}) Tj ET`,
            )
            .join('\n');
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
        );
        objects.push(
            `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        );
    });
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let body = '%PDF-1.4\n';
    const offsets = objects.map((object, i) => {
        const offset = body.length;
        body += `${i + 1} 0 obj\n${object}\nendobj\n`;
        return offset;
    });
    const xref = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
        body += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(body);
}

describe('extractPages', () => {
    it('keeps page numbers', async () => {
        const pages = await extractPages(
            pdf([
                [{ x: 50, y: 700, text: 'First' }],
                [{ x: 50, y: 700, text: 'Second' }],
            ]),
        );

        expect(pages).toEqual([
            { page: 1, text: 'First' },
            { page: 2, text: 'Second' },
        ]);
    });

    it('reads top to bottom, whatever order the file stores', async () => {
        const [page] = await extractPages(
            pdf([
                [
                    { x: 50, y: 600, text: 'Lower' },
                    { x: 50, y: 700, text: 'Upper' },
                ],
            ]),
        );

        expect(page!.text).toBe('Upper\nLower');
    });

    it('keeps table columns apart on one line', async () => {
        const [page] = await extractPages(
            pdf([
                [
                    { x: 300, y: 700, text: '1.00%' },
                    { x: 50, y: 701, text: 'Exit load' },
                ],
            ]),
        );

        expect(page!.text).toBe('Exit load   1.00%');
    });

    it('gives empty text for a page with none', async () => {
        const pages = await extractPages(pdf([[]]));

        expect(pages).toEqual([{ page: 1, text: '' }]);
    });

    it('rejects data that is not a PDF', async () => {
        await expect(
            extractPages(new TextEncoder().encode('not a pdf')),
        ).rejects.toThrow();
    });
});
