import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
    it('keeps same-site paths with query and hash', () => {
        expect(safeNext('/settings/profile')).toBe('/settings/profile');
        expect(
            safeNext('/api/auth/verify-email/a/b?expires=1&signature=x'),
        ).toBe('/api/auth/verify-email/a/b?expires=1&signature=x');
        expect(safeNext('/holdings#top')).toBe('/holdings#top');
    });

    it('falls back for anything that could leave the site', () => {
        for (const next of [
            null,
            undefined,
            '',
            'dashboard',
            'https://evil.example',
            '//evil.example',
            '/\\evil.example',
            '\\\\evil.example',
            'javascript:alert(1)',
        ]) {
            expect(safeNext(next)).toBe('/dashboard');
        }
    });

    it('uses the given fallback', () => {
        expect(safeNext('//x', '/')).toBe('/');
    });
});
