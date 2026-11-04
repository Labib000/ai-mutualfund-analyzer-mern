/** Turns the model's plain-text answer into paragraphs and lists (port of Laravel's toBlocks). */

export type AiBlock =
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: string[] };

export function toBlocks(text: string): AiBlock[] {
    const blocks: AiBlock[] = [];
    let paragraph: string[] = [];

    const flush = () => {
        if (paragraph.length > 0) {
            blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
            paragraph = [];
        }
    };

    for (const raw of text.split('\n')) {
        // Models sometimes add markdown emphasis despite instructions; drop the markers.
        const line = raw.replace(/\*\*|__/g, '').trim();
        const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);

        if (line === '') {
            flush();
        } else if (bullet) {
            flush();
            const last = blocks.at(-1);
            if (last?.type === 'list') last.items.push(bullet[1]!);
            else blocks.push({ type: 'list', items: [bullet[1]!] });
        } else {
            paragraph.push(line);
        }
    }

    flush();
    return blocks;
}
