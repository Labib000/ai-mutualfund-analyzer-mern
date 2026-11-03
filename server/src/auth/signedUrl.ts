import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Temporary signed URLs, like Laravel's URL::temporarySignedRoute():
 * the signature covers the path, the other query params and `expires`.
 */
export class UrlSigner {
    private readonly key: Buffer;

    constructor(secret: string) {
        // A key just for URL signing, derived from the app secret.
        this.key = createHmac('sha256', secret)
            .update('hisaab:signed-urls')
            .digest();
    }

    /** Returns `url` with `expires` (unix seconds) and `signature` appended. */
    sign(url: URL, expiresAt: Date): URL {
        const signed = new URL(url);
        signed.searchParams.delete('signature');
        signed.searchParams.set(
            'expires',
            String(Math.floor(expiresAt.getTime() / 1000)),
        );
        signed.searchParams.set('signature', this.signature(signed));
        return signed;
    }

    /** Checks the signature and expiry of a full URL (or path + query). */
    verify(url: URL, now: Date): 'valid' | 'invalid' | 'expired' {
        const given = url.searchParams.get('signature') ?? '';
        const expected = this.signature(url);

        const a = Buffer.from(given, 'utf8');
        const b = Buffer.from(expected, 'utf8');
        if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid';

        const expires = Number(url.searchParams.get('expires'));
        if (!Number.isFinite(expires)) return 'invalid';

        return expires * 1000 < now.getTime() ? 'expired' : 'valid';
    }

    private signature(url: URL): string {
        const params = new URLSearchParams(url.searchParams);
        params.delete('signature');
        params.sort();
        const payload = `${url.pathname}?${params.toString()}`;
        return createHmac('sha256', this.key).update(payload).digest('hex');
    }
}
