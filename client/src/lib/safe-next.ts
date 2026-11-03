/**
 * Validates a `?next=` redirect target: same-site paths only, so a crafted
 * login link can't bounce the user to another website.
 */
export function safeNext(
    next: string | null | undefined,
    fallback = '/dashboard',
): string {
    if (
        !next ||
        !next.startsWith('/') ||
        next.startsWith('//') ||
        next.includes('\\')
    ) {
        return fallback;
    }

    try {
        const url = new URL(next, 'http://localhost');
        return url.origin === 'http://localhost'
            ? `${url.pathname}${url.search}${url.hash}`
            : fallback;
    } catch {
        return fallback;
    }
}
