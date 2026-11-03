const escapeRegex = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `text` with every occurrence of the search words marked, case-insensitively. */
export default function Highlight({
    text,
    words,
}: {
    text: string;
    words: string[];
}) {
    const terms = words.filter(Boolean);
    if (terms.length === 0) return <>{text}</>;

    // Longest first, so "flexi cap" style overlaps mark the longer word.
    const pattern = new RegExp(
        `(${[...terms]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegex)
            .join('|')})`,
        'gi',
    );
    const lower = terms.map((t) => t.toLowerCase());

    return (
        <>
            {text.split(pattern).map((part, index) =>
                lower.includes(part.toLowerCase()) ? (
                    <mark
                        key={index}
                        className="rounded-sm bg-primary/15 px-0.5 text-inherit"
                    >
                        {part}
                    </mark>
                ) : (
                    part
                ),
            )}
        </>
    );
}
