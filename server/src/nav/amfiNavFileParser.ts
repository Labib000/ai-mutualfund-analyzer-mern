/**
 * Parses AMFI's daily NAVAll.txt (port of App\Nav\AmfiNavFileParser).
 *
 * The file is a header line followed by section lines such as
 * "Open Ended Schemes(Equity Scheme - Large Cap Fund)", AMC name lines,
 * blank lines and semicolon-separated data rows:
 * code;isinGrowth;isinReinvestment;name;plan;option;nav;date
 */
import type { SchemePlan, SchemeType } from '@hisaab/shared';

import { parseDayMonthNameYear } from '../lib/dates.js';
import { Decimal } from '../lib/decimal.js';

/** The AMFI NAV file is not in the format the parser expects. */
export class AmfiNavFileError extends Error {
    override name = 'AmfiNavFileError';
}

/** One scheme line, with the section and AMC it sits under. */
export type AmfiNavRow = {
    amfiCode: number;
    isinGrowth: string | null;
    isinReinvestment: string | null;
    name: string;
    amc: string;
    schemeType: SchemeType;
    category: string;
    plan: SchemePlan | null;
    /** NAV rounded to 4 decimals, or null when not published or not positive. */
    nav: string | null;
    /** "YYYY-MM-DD", or null when the date is invalid. */
    navDate: string | null;
};

const HEADER_PREFIX = 'Scheme Code;';
const FIELD_COUNT = 8;
const NAV_SCALE = 4;

const SECTION = /^(Open Ended|Close Ended|Interval Fund) Schemes\s*\((.*)\)$/;

const SECTION_TYPES: Record<string, SchemeType> = {
    'Open Ended': 'open_ended',
    'Close Ended': 'close_ended',
    'Interval Fund': 'interval',
};

const PLANS: Record<string, SchemePlan> = {
    'Direct Plan': 'direct',
    'Regular Plan': 'regular',
};

type Section = { type: SchemeType; category: string };

/** ETFs appear under "Exchange Traded Funds (ETFs) - ..." and older "Other Scheme - Gold ETF" sections. */
export function isEtf(row: Pick<AmfiNavRow, 'category'>): boolean {
    return /\bETFs?\b/.test(row.category);
}

/** @throws AmfiNavFileError when the content is not an AMFI NAV file */
export function* parseAmfiNavFile(contents: string): Generator<AmfiNavRow> {
    const lines = contents.replace(/^﻿/, '').split(/\r\n|\r|\n/);

    let headerSeen = false;
    let section: Section | null = null;
    let amc: string | null = null;

    for (const [index, raw] of lines.entries()) {
        const line = raw.trim();

        if (line === '') continue;

        if (!headerSeen) {
            if (!line.startsWith(HEADER_PREFIX)) {
                throw new AmfiNavFileError(
                    'Missing the "Scheme Code;..." header line.',
                );
            }
            headerSeen = true;
            continue;
        }

        if (!line.includes(';')) {
            // A section line is sometimes followed directly by rows of the
            // previous AMC, so the AMC carries over across sections.
            const parsed = parseSection(line);
            if (parsed) section = parsed;
            else amc = line;
            continue;
        }

        const fields = line.split(';').map((field) => field.trim());

        if (fields.length !== FIELD_COUNT || !/^\d+$/.test(fields[0]!)) {
            throw new AmfiNavFileError(
                `Unexpected data row on line ${index + 1}.`,
            );
        }

        if (section === null || amc === null) {
            throw new AmfiNavFileError(
                `Data row before a section or AMC line on line ${index + 1}.`,
            );
        }

        yield makeRow(fields, section, amc);
    }

    if (!headerSeen) {
        throw new AmfiNavFileError('The file is empty.');
    }
}

function parseSection(line: string): Section | null {
    const match = SECTION.exec(line);
    if (!match) return null;

    const category = match[2]!
        // AMFI uses both "Equity Scheme - ..." and "Equity Schemes - ..." for the same category.
        .replace(/\bSchemes\b/g, 'Scheme')
        .trim()
        .replace(/\s*\*+/g, '')
        .replace(/\s+/g, ' ');

    return { type: SECTION_TYPES[match[1]!]!, category };
}

function makeRow(fields: string[], section: Section, amc: string): AmfiNavRow {
    const [code, isinGrowth, isinReinvestment, name, plan, option, nav, date] =
        fields as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
        ];

    return {
        amfiCode: Number(code),
        isinGrowth: isin(isinGrowth),
        isinReinvestment: isin(isinReinvestment),
        name: [name, plan, option].filter((part) => part !== '').join(' - '),
        amc,
        schemeType: section.type,
        category: section.category,
        plan: PLANS[plan] ?? null,
        nav: parseNav(nav),
        navDate: parseDayMonthNameYear(date),
    };
}

function isin(value: string): string | null {
    return /^IN[A-Z0-9]{10}$/.test(value) ? value : null;
}

function parseNav(value: string): string | null {
    if (!Decimal.isNumeric(value) || Decimal.compare(value, '0') <= 0) {
        return null;
    }
    return Decimal.round(value, NAV_SCALE);
}
