import { z } from 'zod';

import { isRupeeAmount, rupeesToPaise } from './money.js';
import type { SchemePlan } from './schemes.js';

export const TRANSACTION_TYPES = [
    'purchase',
    'sip_installment',
    'redemption',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Whether this transaction type adds units to the holding. */
export const addsUnits = (type: TransactionType): boolean =>
    type !== 'redemption';

export const XIRR_STATUSES = [
    /** Investments span at least a year. */
    'ok',
    /** Between 30 days and a year: annualised from a short period. */
    'short_period',
    /** The first investment is less than 30 days old; XIRR isn't shown. */
    'too_recent',
    /** No rate solves the cash flows (for example, nothing invested yet). */
    'not_meaningful',
] as const;
export type XirrStatus = (typeof XIRR_STATUSES)[number];

/** Returns for one fund or a whole portfolio, as the API sends them. Money is in paise. */
export type PerformanceJson = {
    /** 3 dp string; null for a portfolio, which mixes funds. */
    unitsHeld: string | null;
    investedPaise: number;
    valuePaise: number;
    unrealisedGainPaise: number;
    realisedGainPaise: number;
    totalGainPaise: number;
    /** Rounded to 2 dp; null when nothing is held. */
    absoluteReturnPct: number | null;
    /** Rounded to 2 dp. */
    xirrPct: number | null;
    xirrStatus: XirrStatus;
    /** "YYYY-MM-DD". */
    valuedOn: string | null;
};

// ---------------------------------------------------------------------------
// Request schemas (port of app/Http/Requests/Portfolio/*). Field names and
// messages follow Laravel, so 422 errors match the PHP app.
// ---------------------------------------------------------------------------

const required = (label: string) => `The ${label} field is required.`;

const isBlank = (value: unknown) =>
    value === undefined || value === null || value === '';

/** A real calendar date in "YYYY-MM-DD" form. */
export function isIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;

    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const utc = new Date(Date.UTC(y, m - 1, d));

    return (
        utc.getUTCFullYear() === y &&
        utc.getUTCMonth() === m - 1 &&
        utc.getUTCDate() === d
    );
}

/** PHP's number_format() for the ₹ limits in RupeeAmount messages. */
function formatLimit(paise: number): string {
    const fixed = (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
    const [whole, fraction] = fixed.split('.');
    const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `₹${grouped}${fraction ? `.${fraction}` : ''}`;
}

const MIN_AMOUNT_PAISE = 100;
const MAX_AMOUNT_PAISE = 10_000_000_000;

type Ctx = z.RefinementCtx;

/** Laravel's `date_format:Y-m-d`: "YYYY-MM-DD", or null when blank (after adding a "required" issue if needed). */
function checkDate(
    value: unknown,
    label: string,
    isRequired: boolean,
    ctx: Ctx,
): string | null {
    if (isBlank(value)) {
        if (isRequired)
            ctx.addIssue({ code: 'custom', message: required(label) });
        return null;
    }
    if (typeof value !== 'string' || !isIsoDate(value)) {
        ctx.addIssue({
            code: 'custom',
            message: `The ${label} field must match the format Y-m-d.`,
        });
        return null;
    }
    return value;
}

const requiredDate = (label: string) =>
    z
        .unknown()
        .optional()
        .transform(
            (value, ctx) => checkDate(value, label, true, ctx) as string,
        );

const optionalDate = (label: string) =>
    z
        .unknown()
        .optional()
        .transform((value, ctx) => checkDate(value, label, false, ctx));

/** Laravel's RupeeAmount rule (₹1 to ₹10 crore): paise, or null when blank. */
function checkRupees(
    value: unknown,
    label: string,
    isRequired: boolean,
    ctx: Ctx,
): number | null {
    if (isBlank(value)) {
        if (isRequired)
            ctx.addIssue({ code: 'custom', message: required(label) });
        return null;
    }
    if (typeof value !== 'string' && !Number.isInteger(value)) {
        ctx.addIssue({
            code: 'custom',
            message: `Enter the ${label} in rupees.`,
        });
        return null;
    }

    const text = typeof value === 'string' ? value : String(value as number);
    if (!isRupeeAmount(text)) {
        ctx.addIssue({
            code: 'custom',
            message: `Enter the ${label} in rupees, with at most 2 decimals (for example 5000 or 499.50).`,
        });
        return null;
    }

    let paise: number;
    try {
        paise = rupeesToPaise(text);
    } catch {
        paise = Number.POSITIVE_INFINITY;
    }

    if (paise < MIN_AMOUNT_PAISE) {
        ctx.addIssue({
            code: 'custom',
            message: `The ${label} must be at least ${formatLimit(MIN_AMOUNT_PAISE)}.`,
        });
        return null;
    }
    if (paise > MAX_AMOUNT_PAISE) {
        ctx.addIssue({
            code: 'custom',
            message: `The ${label} must not be more than ${formatLimit(MAX_AMOUNT_PAISE)}.`,
        });
        return null;
    }
    return paise;
}

const requiredRupees = (label: string) =>
    z
        .unknown()
        .optional()
        .transform(
            (value, ctx) => checkRupees(value, label, true, ctx) as number,
        );

const optionalRupees = (label: string) =>
    z
        .unknown()
        .optional()
        .transform((value, ctx) => checkRupees(value, label, false, ctx));

/** Units with up to 3 decimals, > 0 (UnitsInput). Output: 3 dp string, or null when blank. */
const unitsField = z
    .unknown()
    .optional()
    .transform((value, ctx): string | null => {
        if (isBlank(value)) return null;

        const text = typeof value === 'number' ? String(value) : value;
        if (
            typeof text !== 'string' ||
            !/^\d+(\.\d{1,3})?$/.test(text.trim())
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Units can have at most 3 decimals.',
            });
            return z.NEVER;
        }

        const [whole, fraction = ''] = text.trim().split('.');
        const units = `${whole!.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(3, '0')}`;

        if (/^0\.0+$/.test(units)) {
            ctx.addIssue({
                code: 'custom',
                message: 'The units field must be greater than 0.',
            });
            return z.NEVER;
        }
        return units;
    });

/** Laravel's `boolean` (true, "1", "on", "true"). */
const booleanField = z
    .unknown()
    .optional()
    .transform(
        (value) =>
            value === true ||
            value === 1 ||
            ['1', 'on', 'true'].includes(String(value)),
    );

const dayOfMonthField = z
    .unknown()
    .optional()
    .transform((value, ctx): number => {
        const label = 'day of the month';
        if (isBlank(value)) {
            ctx.addIssue({ code: 'custom', message: required(label) });
            return z.NEVER;
        }

        const day =
            typeof value === 'string' && /^-?\d+$/.test(value.trim())
                ? Number(value)
                : value;
        if (typeof day !== 'number' || !Number.isInteger(day)) {
            ctx.addIssue({
                code: 'custom',
                message: `The ${label} field must be an integer.`,
            });
            return z.NEVER;
        }
        if (day < 1 || day > 31) {
            ctx.addIssue({
                code: 'custom',
                message: `The ${label} field must be between 1 and 31.`,
            });
            return z.NEVER;
        }
        return day;
    });

export const holdingCreateSchema = z.object({
    scheme_id: z
        .unknown()
        .optional()
        .transform((value, ctx): string => {
            if (isBlank(value)) {
                ctx.addIssue({
                    code: 'custom',
                    message: required('scheme id'),
                });
                return z.NEVER;
            }
            if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'The selected scheme id is invalid.',
                });
                return z.NEVER;
            }
            return value;
        }),
});

/** The server also checks the date isn't in the future (IST). */
export const purchaseSchema = z.object({
    txn_date: requiredDate('date'),
    amount: requiredRupees('amount'),
    units: unitsField,
});

export const redemptionSchema = z
    .object({
        txn_date: requiredDate('date'),
        all_units: booleanField,
        units: unitsField,
        amount: optionalRupees('amount received'),
    })
    .superRefine((data, ctx) => {
        if (!data.all_units && data.units === null) {
            ctx.addIssue({
                code: 'custom',
                path: ['units'],
                message: required('units'),
            });
        }
    })
    // Units to redeem, or null to redeem everything held on the date.
    .transform((data) => ({
        ...data,
        units: data.all_units ? null : data.units,
    }));

export const sipCreateSchema = z
    .object({
        amount: requiredRupees('amount'),
        day_of_month: dayOfMonthField,
        start_date: requiredDate('start date'),
        end_date: optionalDate('end date'),
    })
    .superRefine((data, ctx) => {
        if (data.start_date < '2000-01-01') {
            ctx.addIssue({
                code: 'custom',
                path: ['start_date'],
                message:
                    'The start date field must be a date after or equal to 2000-01-01.',
            });
        }
        if (data.end_date !== null && data.end_date < data.start_date) {
            ctx.addIssue({
                code: 'custom',
                path: ['end_date'],
                message:
                    'The end date field must be a date after or equal to start date.',
            });
        }
    });

/** The server also checks the end date isn't before a recorded installment. */
export const sipUpdateSchema = z.object({
    amount: requiredRupees('amount'),
    day_of_month: dayOfMonthField,
    end_date: optionalDate('end date'),
});

export type PurchaseInput = z.output<typeof purchaseSchema>;
export type RedemptionInput = z.output<typeof redemptionSchema>;
export type SipCreateInput = z.output<typeof sipCreateSchema>;
export type SipUpdateInput = z.output<typeof sipUpdateSchema>;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type SchemeSummary = {
    id: string;
    name: string;
    /** Fund house, e.g. "PPFAS Mutual Fund". */
    amc: string;
    category: string;
    plan: SchemePlan | null;
    latestNav: string | null;
    latestNavDate: string | null;
};

export type SchemeSearchResult = SchemeSummary & {
    isHeld: boolean;
    /** The user's holding of this scheme, for linking to it; null when not held. */
    holdingId: string | null;
};

export type SchemeSearchResponse = {
    query: string;
    results: SchemeSearchResult[];
};

export type HoldingSummary = {
    id: string;
    scheme: SchemeSummary;
    performance: PerformanceJson;
};

export type HoldingListResponse = {
    holdings: HoldingSummary[];
    summary: PerformanceJson;
};

export type TransactionJson = {
    id: string;
    type: TransactionType;
    txnDate: string;
    navDate: string;
    nav: string;
    amountPaise: number;
    stampDutyPaise: number;
    units: string;
    unitsOverridden: boolean;
    fromSip: boolean;
};

export type SipJson = {
    id: string;
    amountPaise: number;
    dayOfMonth: number;
    startDate: string;
    endDate: string | null;
    isRunning: boolean;
    /** The next installment not yet recorded; can be in the past while its NAV is unpublished. */
    nextDue: string | null;
    /** The end date can't be moved before this (last recorded installment, or the start date). */
    earliestEndDate: string;
};

export type HoldingDetailResponse = {
    holding: HoldingSummary;
    transactions: TransactionJson[];
    sips: SipJson[];
    /** Today in IST, "YYYY-MM-DD". */
    today: string;
};

/** Every write answers with the toast text. */
/** `warning` marks a toast that should show as a warning. */
export type MessageResponse = { message: string; warning?: boolean };
export type HoldingCreatedResponse = MessageResponse & {
    holding: { id: string };
};

/* ---------- Dashboard (Phase 2d) ---------- */

/** Asset classes in display order (port of App\Enums\AssetClass). */
export const ASSET_CLASSES = [
    'equity',
    'debt',
    'hybrid',
    'solution_oriented',
    'other',
] as const;
export type AssetClassKey = (typeof ASSET_CLASSES)[number];

/** One weekly point of the value-over-time chart. */
export type HistoryPoint = {
    date: string;
    valuePaise: number;
    investedPaise: number;
};

export type Allocation = {
    classes: {
        key: AssetClassKey;
        label: string;
        valuePaise: number;
        pct: number;
    }[];
    categories: {
        label: string;
        assetClass: AssetClassKey;
        valuePaise: number;
        pct: number;
    }[];
};

export type DashboardResponse = {
    fundCount: number;
    summary: PerformanceJson;
    history: HistoryPoint[];
    allocation: Allocation;
    /** The biggest funds by current value, at most 5. */
    topHoldings: HoldingSummary[];
};
