import { describe, expect, it } from 'vitest';

import { amcInitials } from './amc-avatar';

describe('amcInitials', () => {
    it('uses the first letters of the fund house name', () => {
        expect(amcInitials('Aditya Birla Sun Life Mutual Fund')).toBe('AB');
        expect(amcInitials('PPFAS Mutual Fund')).toBe('PP');
        expect(amcInitials('quant Mutual Fund')).toBe('QU');
        expect(amcInitials('')).toBe('?');
    });
});

describe('amcLogo', () => {
    it('finds bundled logos from the AMFI fund house name', async () => {
        const { amcLogo, amcSlug } = await import('@/lib/amc-logos');
        expect(amcSlug('Aditya Birla Sun Life Mutual Fund')).toBe(
            'aditya-birla-sun-life',
        );
        expect(amcSlug('ASK MUTUAL FUND')).toBe('ask');
        expect(amcLogo('PPFAS Mutual Fund')).toBe('/amc-logos/ppfas.png');
        expect(amcLogo('Aditya Birla Sun Life Mutual Fund')).toBe(
            '/amc-logos/aditya-birla-sun-life.png',
        );
        expect(amcLogo('WhiteOak Capital Mutual Fund')).toBe(
            '/amc-logos/whiteoak-capital.png',
        );
        expect(amcLogo('SBI Mutual Fund')).toBe('/amc-logos/sbi.png');
        expect(amcLogo('UTI Mutual Fund')).toBe('/amc-logos/uti.png');
        expect(amcLogo('Union Mutual Fund')).toBeNull();
    });
});
