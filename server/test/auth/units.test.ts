import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    checkPasswordStrength,
    hibpChecker,
    passwordRulesString,
} from '../../src/auth/password.js';
import { UrlSigner } from '../../src/auth/signedUrl.js';
import { MongoRateLimitStore } from '../../src/lib/rateLimitStore.js';
import { RateLimit } from '../../src/models/rateLimit.js';
import { useTestDb } from '../support/db.js';

describe('checkPasswordStrength', () => {
    const lax = { strict: false, pwned: async () => false };
    const strict = { strict: true, pwned: async () => false };

    it('needs 8 characters outside production', async () => {
        expect(await checkPasswordStrength('1234567', lax)).toMatch(
            /at least 8/,
        );
        expect(await checkPasswordStrength('12345678', lax)).toBeNull();
    });

    it('counts characters, not UTF-16 units', async () => {
        expect(await checkPasswordStrength('₹₹₹₹₹₹₹₹', lax)).toBeNull();
        expect(await checkPasswordStrength('😀😀😀😀', lax)).toMatch(
            /at least 8/,
        );
    });

    it('checks the rules in Laravel order when strict', async () => {
        expect(await checkPasswordStrength('Short1!', strict)).toMatch(
            /at least 12/,
        );
        expect(await checkPasswordStrength('lowercase-only-1', strict)).toMatch(
            /uppercase/,
        );
        expect(await checkPasswordStrength('No-Digits-Here', strict)).toMatch(
            /number/,
        );
        expect(await checkPasswordStrength('NoSymbol123456', strict)).toMatch(
            /symbol/,
        );
        expect(
            await checkPasswordStrength('Good-Pass-1234', strict),
        ).toBeNull();
    });

    it('only calls the breach check when every other rule passes', async () => {
        const pwned = vi.fn(async () => true);
        const policy = { strict: true, pwned };

        expect(await checkPasswordStrength('short', policy)).toMatch(
            /at least 12/,
        );
        expect(pwned).not.toHaveBeenCalled();

        expect(await checkPasswordStrength('Good-Pass-1234', policy)).toMatch(
            /data leak/,
        );
        expect(pwned).toHaveBeenCalledWith('Good-Pass-1234');
    });

    it('describes the rules for the passwordrules attribute', () => {
        expect(passwordRulesString({ strict: false })).toBe('minlength: 8;');
        expect(passwordRulesString({ strict: true })).toContain(
            'required: special;',
        );
    });
});

describe('hibpChecker', () => {
    afterEach(() => vi.unstubAllGlobals());

    const sha1 = (s: string) =>
        createHash('sha1').update(s).digest('hex').toUpperCase();

    it('sends only the 5-char prefix and matches the suffix', async () => {
        const hash = sha1('password');
        const fetchMock = vi.fn(
            async (_url: string) =>
                new Response(
                    `0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:9545824\r\n`,
                ),
        );
        vi.stubGlobal('fetch', fetchMock);

        expect(await hibpChecker('password')).toBe(true);
        expect(fetchMock.mock.calls[0]![0]).toBe(
            `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
        );
    });

    it('ignores padding entries with a zero count', async () => {
        const hash = sha1('padded');
        vi.stubGlobal(
            'fetch',
            async () => new Response(`${hash.slice(5)}:0\n`),
        );

        expect(await hibpChecker('padded')).toBe(false);
    });

    it('fails open when the API is down', async () => {
        vi.stubGlobal('fetch', async () => {
            throw new Error('network down');
        });
        expect(await hibpChecker('anything')).toBe(false);

        vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
        expect(await hibpChecker('anything')).toBe(false);
    });
});

describe('UrlSigner', () => {
    const signer = new UrlSigner('a'.repeat(40));
    const at = new Date('2026-10-08T10:00:00Z');
    const url = new URL('http://localhost:5173/api/auth/verify-email/abc/def');

    it('signs and verifies', () => {
        const signed = signer.sign(url, new Date(at.getTime() + 60_000));

        expect(signer.verify(signed, at)).toBe('valid');
        // Host doesn't matter, only path + query.
        expect(
            signer.verify(
                new URL(signed.pathname + signed.search, 'https://x.y'),
                at,
            ),
        ).toBe('valid');
    });

    it('detects expiry, tampering and other keys', () => {
        const signed = signer.sign(url, new Date(at.getTime() + 60_000));

        expect(signer.verify(signed, new Date(at.getTime() + 61_000))).toBe(
            'expired',
        );

        const tampered = new URL(signed);
        tampered.pathname = '/api/auth/verify-email/OTHER/def';
        expect(signer.verify(tampered, at)).toBe('invalid');

        const longer = new URL(signed);
        longer.searchParams.set(
            'expires',
            String(Number(signed.searchParams.get('expires')) + 1),
        );
        expect(signer.verify(longer, at)).toBe('invalid');

        expect(new UrlSigner('b'.repeat(40)).verify(signed, at)).toBe(
            'invalid',
        );
        expect(signer.verify(url, at)).toBe('invalid');
    });
});

describe('MongoRateLimitStore', () => {
    useTestDb();

    const store = () => {
        const s = new MongoRateLimitStore('test');
        s.init({ windowMs: 60_000 } as never);
        return s;
    };

    it('counts hits in a window', async () => {
        const s = store();

        expect((await s.increment('k')).totalHits).toBe(1);
        expect((await s.increment('k')).totalHits).toBe(2);
        const third = await s.increment('k');

        expect(third.totalHits).toBe(3);
        expect(third.resetTime!.getTime()).toBeGreaterThan(Date.now() + 50_000);
        expect((await s.get('k'))!.totalHits).toBe(3);
    });

    it('starts a new window after the old one ends', async () => {
        const s = store();
        await s.increment('k2');
        await s.increment('k2');

        await RateLimit.updateOne(
            { key: 'test:k2' },
            { resetAt: new Date(Date.now() - 1) },
        );

        expect(await s.get('k2')).toBeUndefined();
        expect((await s.increment('k2')).totalHits).toBe(1);
    });

    it('is atomic under concurrent hits', async () => {
        const s = store();

        await Promise.all(
            Array.from({ length: 20 }, () => s.increment('race')),
        );

        expect((await s.get('race'))!.totalHits).toBe(20);
    });

    it('decrements and resets keys, separately per prefix', async () => {
        const s = store();
        const other = new MongoRateLimitStore('other');
        other.init({ windowMs: 60_000 } as never);

        await s.increment('k3');
        await s.increment('k3');
        await other.increment('k3');

        await s.decrement('k3');
        expect((await s.get('k3'))!.totalHits).toBe(1);

        await s.resetKey('k3');
        expect(await s.get('k3')).toBeUndefined();
        expect((await other.get('k3'))!.totalHits).toBe(1);
    });
});
