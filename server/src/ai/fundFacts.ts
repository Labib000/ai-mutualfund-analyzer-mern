/**
 * A scheme's past returns and risk as the AI model sees them (port of
 * App\Ai\FundFacts). Works from the cached percentages, as Laravel does after
 * FundStatsResult::fromArray().
 */
import type { FundStatsJson } from '@hisaab/shared';

import { aiDate, numberFormat, signedPercent } from './text.js';

const signed = (pct: number) => signedPercent(pct, 1);
const plain = (pct: number) => `${numberFormat(pct, 1)}%`;

function returns(stats: FundStatsJson, withSince: boolean): string {
    const parts: string[] = [];
    if (stats.return1yPct !== null)
        parts.push(`1 year ${signed(stats.return1yPct)}`);
    if (stats.cagr3yPct !== null)
        parts.push(`3 years ${signed(stats.cagr3yPct)} a year`);
    if (stats.cagr5yPct !== null)
        parts.push(`5 years ${signed(stats.cagr5yPct)} a year`);
    if (withSince || parts.length === 0) {
        parts.push(
            `since ${aiDate(stats.since)} ${signed(stats.sinceStartPct)}` +
                (stats.sinceStartAnnualised
                    ? ' a year'
                    : ' in total (less than a year of history)'),
        );
    }
    return parts.join('; ');
}

/** Every figure, one per line, for the fund explainer. */
export function fundFactsFull(stats: FundStatsJson): string {
    const lines = [
        `Past NAV returns up to ${aiDate(stats.asOf)}: ${returns(stats, true)}.`,
    ];
    if (stats.volatilityPct !== null) {
        lines.push(
            `Volatility (annualised spread of weekly returns, last 3 years or less): ${plain(stats.volatilityPct)}.`,
        );
    }
    lines.push(
        stats.drawdownPeak === null
            ? `Largest fall from a peak since ${aiDate(stats.since)}: none.`
            : `Largest fall from a peak since ${aiDate(stats.since)}: −${plain(stats.maxDrawdownPct)}` +
                  ` (from ${aiDate(stats.drawdownPeak)} to ${aiDate(stats.drawdownTrough!)}).`,
    );
    return lines.join('\n');
}

/** The headline figures in one short phrase, for a fund line in the portfolio data. */
export function fundFactsShort(stats: FundStatsJson): string {
    const trailing: string[] = [];
    for (const [label, value] of [
        ['1y', stats.return1yPct],
        ['3y', stats.cagr3yPct],
        ['5y', stats.cagr5yPct],
    ] as const) {
        if (value !== null)
            trailing.push(
                `${label} ${signed(value)}${label === '1y' ? '' : ' p.a.'}`,
            );
    }

    const parts = [
        `fund NAV return ${trailing.length === 0 ? returns(stats, false) : trailing.join(', ')}`,
    ];
    if (stats.volatilityPct !== null)
        parts.push(`volatility ${plain(stats.volatilityPct)}`);
    if (stats.drawdownPeak !== null)
        parts.push(`largest fall −${plain(stats.maxDrawdownPct)}`);
    return parts.join('; ');
}
