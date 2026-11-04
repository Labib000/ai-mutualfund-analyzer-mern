/** Word-by-word reveal of an answer that arrived all at once. */

/** The answer split into words, each keeping the spaces and line breaks after it. */
export function revealTokens(text: string): string[] {
    return text.match(/\S+\s*/g) ?? [];
}

/** How long the reveal takes: about 18 ms a word, at most 1.6 s. */
export function revealDuration(words: number): number {
    return Math.min(1600, words * 18);
}

/** Words shown after `elapsed` ms. */
export function revealCount(words: number, elapsed: number): number {
    const duration = revealDuration(words);
    if (duration === 0 || elapsed >= duration) return words;
    return Math.max(
        0,
        Math.min(words, Math.ceil((elapsed / duration) * words)),
    );
}
