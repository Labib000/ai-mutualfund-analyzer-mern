/**
 * Pulls the text out of a PDF, page by page. A PDF only stores characters at
 * positions, so lines are rebuilt here: pieces at the same height form a line,
 * read left to right, and a wide gap between them is kept so that table
 * columns stay apart. Used by the local ingestion CLI only.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfPage = {
    /** 1-based, as printed in citations. */
    page: number;
    text: string;
};

type Piece = { text: string; x: number; y: number; width: number };

/** Pieces whose heights differ by less than this share a line. */
const SAME_LINE = 3;
/** A gap this wide (in points) is a column break, not a word space. */
const COLUMN_GAP = 12;
const COLUMN_SEPARATOR = '   ';

function linesOf(pieces: Piece[]): string[] {
    const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Piece[][] = [];

    for (const piece of sorted) {
        const line = lines.at(-1);
        if (line && Math.abs(line[0]!.y - piece.y) < SAME_LINE)
            line.push(piece);
        else lines.push([piece]);
    }

    return lines.map((line) => {
        let text = '';
        let end: number | null = null;

        for (const piece of line.sort((a, b) => a.x - b.x)) {
            if (end !== null) {
                const gap = piece.x - end;
                if (gap >= COLUMN_GAP) text += COLUMN_SEPARATOR;
                else if (gap > 1 && !text.endsWith(' ')) text += ' ';
            }
            text += piece.text;
            end = piece.x + piece.width;
        }
        return text.trimEnd();
    });
}

/** @throws when the data isn't a readable PDF */
export async function extractPages(data: Uint8Array): Promise<PdfPage[]> {
    const loading = getDocument({
        data,
        verbosity: 0,
    });

    try {
        const pdf = await loading.promise;
        const pages: PdfPage[] = [];
        for (let page = 1; page <= pdf.numPages; page++) {
            const { items } = await (await pdf.getPage(page)).getTextContent();
            const pieces = items.flatMap((item) =>
                'str' in item && item.str.trim() !== ''
                    ? [
                          {
                              text: item.str,
                              x: item.transform[4] as number,
                              y: item.transform[5] as number,
                              width: item.width,
                          },
                      ]
                    : [],
            );
            pages.push({ page, text: linesOf(pieces).join('\n') });
        }
        return pages;
    } finally {
        await loading.destroy();
    }
}
