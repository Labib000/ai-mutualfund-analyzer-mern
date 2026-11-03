/**
 * Fund house logos bundled in public/amc-logos/ (128px PNGs, from each AMC's
 * own website icon). Fund houses not listed fall back to initials.
 */
const LOGOS = new Set([
    'aditya-birla-sun-life',
    'angel-one',
    'ask',
    'axis',
    'bajaj-finserv',
    'bandhan',
    'canara-robeco',
    'carnelian',
    'choice',
    'dsp',
    'edelweiss',
    'groww',
    'hdfc',
    'helios',
    'hsbc',
    'icici-prudential',
    'invesco',
    'iti',
    'jio-blackrock',
    'kotak-mahindra',
    'mahindra-manulife',
    'motilal-oswal',
    'navi',
    'nippon-india',
    'old-bridge',
    'ppfas',
    'quant',
    'quantum',
    'samco',
    'sbi',
    'tata',
    'trust',
    'uti',
    'whiteoak-capital',
    'zerodha',
]);

/** "Aditya Birla Sun Life Mutual Fund" → "aditya-birla-sun-life". */
export function amcSlug(amc: string): string {
    return amc
        .replace(/\s+mutual\s+fund$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** URL of the fund house's logo, or null when we don't have one. */
export function amcLogo(amc: string): string | null {
    const slug = amcSlug(amc);
    return LOGOS.has(slug) ? `/amc-logos/${slug}.png` : null;
}
