/** Section a scheme sits under in AMFI's NAV file. */
export const SCHEME_TYPES = ['open_ended', 'close_ended', 'interval'] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

/** Direct or Regular plan; null for older schemes that publish neither. */
export const SCHEME_PLANS = ['direct', 'regular'] as const;
export type SchemePlan = (typeof SCHEME_PLANS)[number];
