import {
    Scheme,
    type SchemeDoc,
    type SchemeFields,
} from '../../src/models/scheme.js';

let counter = 0;

/** Like Laravel's Scheme::factory(): an active open-ended Direct Growth scheme. */
export async function createScheme(
    overrides: Partial<SchemeFields> = {},
): Promise<SchemeDoc> {
    counter += 1;

    return Scheme.create({
        amfiCode: 900000 + counter,
        isinGrowth: null,
        name: `Test Fund ${counter} - Direct Plan - Growth`,
        amc: 'Test Mutual Fund',
        schemeType: 'open_ended',
        category: 'Equity Scheme - Flexi Cap Fund',
        plan: 'direct',
        latestNav: '10.0000',
        latestNavDate: '2026-10-07',
        isActive: true,
        ...overrides,
    });
}
