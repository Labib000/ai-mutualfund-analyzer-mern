import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
    AmfiNavFileError,
    type AmfiNavRow,
    isEtf,
    parseAmfiNavFile,
} from '../../src/nav/amfiNavFileParser.js';

// Port of tests/Unit/Nav/AmfiNavFileParserTest.php
const fixture = readFileSync(
    new URL('../fixtures/amfi/NAVAll-sample.txt', import.meta.url),
    'utf8',
);

const parseAll = (contents: string) => [...parseAmfiNavFile(contents)];

describe('parseAmfiNavFile', () => {
    let rows: Map<number, AmfiNavRow>;
    const row = (code: number) => {
        const found = rows.get(code);
        if (!found) throw new Error(`no row ${code}`);
        return found;
    };

    beforeAll(() => {
        rows = new Map(parseAll(fixture).map((r) => [r.amfiCode, r]));
    });

    it('parses every data row', () => {
        expect(rows.size).toBe(12);
    });

    it('parses a current format row', () => {
        expect(row(135762)).toEqual({
            amfiCode: 135762,
            name: "Axis Children's Fund - Direct Plan - Growth Option",
            amc: 'Axis Mutual Fund',
            schemeType: 'open_ended',
            category: "Children’s Fund - Childrens' Fund",
            plan: 'direct',
            isinGrowth: 'INF846K01WO1',
            isinReinvestment: null,
            nav: '29.2304',
            navDate: '2026-10-07',
        });
    });

    it('reads the reinvestment ISIN', () => {
        expect(row(135763).isinReinvestment).toBe('INF846K01WQ6');
    });

    it('normalizes plural section names', () => {
        expect(row(119133).category).toBe('Equity Scheme - Large Cap Fund');
        expect(row(119527).category).toBe('Equity Scheme - Large Cap Fund');
        expect(row(147825).category).toBe(
            'Solution Oriented Scheme - Retirement Fund',
        );
    });

    it('keeps the bare name for older rows without a plan', () => {
        expect(row(119527).name).toBe('Aditya Birla Sun Life Large Cap Fund');
        expect(row(119527).plan).toBeNull();
    });

    it('pads NAVs to four decimals', () => {
        expect(row(119133).nav).toBe('49.5600');
        expect(row(119527).nav).toBe('88.1100');
    });

    it('rounds NAVs with more than four decimals half up', () => {
        expect(row(134568).nav).toBe('11.2128');
    });

    it('turns zero and unpublished NAVs into null', () => {
        expect(row(148239).nav).toBeNull();
        expect(row(100026).nav).toBeNull();
        expect(row(100026).navDate).toBe('2026-10-07');
    });

    it('nulls invalid ISINs and trims valid ones', () => {
        expect(row(152713).isinReinvestment).toBeNull();
        expect(row(133786).isinGrowth).toBeNull();
        expect(row(133786).isinReinvestment).toBe('INF178L01BT0');
    });

    it('carries the AMC over when a section has no AMC line', () => {
        expect(row(151533).amc).toBe('Aditya Birla Sun Life Mutual Fund');
    });

    it('detects ETFs', () => {
        expect(isEtf(row(151533))).toBe(true);
        expect(isEtf(row(152713))).toBe(false);
    });

    it('reads interval and close-ended sections', () => {
        expect(row(105689).schemeType).toBe('interval');
        expect(row(105689).category).toBe('Income');
        expect(row(105689).plan).toBe('regular');

        expect(row(134568).schemeType).toBe('close_ended');
        expect(row(134568).navDate).toBe('2018-05-07');
    });

    it('handles LF line endings and a byte order mark', () => {
        const parsed = parseAll(
            '﻿Scheme Code;a;b;c;d;e;f;g\n\nOpen Ended Schemes(Gilt)\n\nSBI Mutual Fund\n\n' +
                '101206;INF200K01180;-;SBI Gilt Fund;;;65.2;07-Oct-2026\n',
        );

        expect(parsed).toHaveLength(1);
        expect(parsed[0]!.category).toBe('Gilt');
        expect(parsed[0]!.nav).toBe('65.2000');
    });

    it('turns an invalid date into null', () => {
        const parsed = parseAll(
            'Scheme Code;a;b;c;d;e;f;g\nOpen Ended Schemes(Gilt)\nSBI Mutual Fund\n' +
                '101206;INF200K01180;-;SBI Gilt Fund;;;65.2;31-Feb-2026\n',
        );

        expect(parsed[0]!.navDate).toBeNull();
    });

    it('rejects content without the header', () => {
        expect(() => parseAll('<html>Service unavailable</html>')).toThrow(
            AmfiNavFileError,
        );
    });

    it('rejects empty content', () => {
        expect(() => parseAll('')).toThrow(AmfiNavFileError);
    });

    it('rejects rows with an unexpected column count', () => {
        expect(() =>
            parseAll(
                'Scheme Code;a;b;c;d;e;f;g\nOpen Ended Schemes(Gilt)\nSBI Mutual Fund\n101206;INF200K01180;SBI Gilt Fund;65.2;07-Oct-2026\n',
            ),
        ).toThrow(AmfiNavFileError);
    });

    it('rejects rows before any section', () => {
        expect(() =>
            parseAll(
                'Scheme Code;a;b;c;d;e;f;g\n101206;INF200K01180;-;SBI Gilt Fund;;;65.2;07-Oct-2026\n',
            ),
        ).toThrow(AmfiNavFileError);
    });
});
