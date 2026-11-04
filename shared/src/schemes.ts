/** Section a scheme sits under in AMFI's NAV file. */
export const SCHEME_TYPES = ['open_ended', 'close_ended', 'interval'] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

/** Direct or Regular plan; null for older schemes that publish neither. */
export const SCHEME_PLANS = ['direct', 'regular'] as const;
export type SchemePlan = (typeof SCHEME_PLANS)[number];

/** Name parts that only say which plan or payout option it is. */
const PLAN_PART =
    /\b(direct|regular|growth|plan|option|idcw|dividend|payout|reinvest(ment)?|bonus)\b/i;

/**
 * A scheme's name without its plan and option, for sentences:
 * "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" → "Parag Parikh Flexi Cap Fund",
 * "UTI - Nifty Next 50 Index Fund - Direct Plan - Growth" → "UTI Nifty Next 50 Index Fund".
 *
 * Laravel's InsightFund::shortName() kept only the part before the first " - ",
 * which reduced the UTI example to "UTI"; this keeps every part that names the fund.
 */
export function shortSchemeName(name: string): string {
    const parts = name
        .split(/\s+-\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    const kept = parts.filter((part, i) => i === 0 || !PLAN_PART.test(part));
    return kept.join(' ') || name;
}
