/** A NAV and the date it was published for, which may differ from the date asked about. */
export type NavPoint = {
    /** "YYYY-MM-DD". */
    date: string;
    /** 4 dp string. */
    nav: string;
};

/** A source of historical NAVs for a scheme (port of App\Nav\NavProvider). */
export interface NavProvider {
    /**
     * Published NAVs from `from` ("YYYY-MM-DD", or inception when omitted) up to today,
     * rounded to 4 decimals, oldest first.
     *
     * @throws NavProviderError when the source is unreachable, doesn't know the scheme, or returns malformed data
     */
    history(amfiCode: number, from?: string | null): Promise<NavPoint[]>;
}

export class NavProviderError extends Error {
    override name = 'NavProviderError';
}
