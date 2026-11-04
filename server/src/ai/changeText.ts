/** A portfolio's change over a period as the AI model sees it (port of App\Ai\ChangeText). */
import {
    type ChangeFundJson,
    type PortfolioChangeJson,
    formatInr,
} from '@hisaab/shared';

import { aiDate, signedPercent } from './text.js';

function movement(paise: number, pct: number | null): string {
    return pct === null
        ? formatInr(paise, true)
        : `${formatInr(paise, true)} (${signedPercent(pct)})`;
}

function fundLine(fund: ChangeFundJson): string {
    const parts = [
        `market movement ${movement(fund.marketPaise, fund.marketPct)}`,
    ];
    if (fund.netFlowPaise !== 0)
        parts.push(`new money ${formatInr(fund.netFlowPaise, true)}`);
    if (fund.startPaise === 0) parts.push('first bought in this period');
    else if (fund.endPaise === 0) parts.push('fully redeemed in this period');
    return parts.join('; ');
}

/** @param perFund Every fund's line, or only the funds that moved most and least. */
export function changeText(
    change: PortfolioChangeJson,
    perFund = true,
): string {
    const lines = [
        `CHANGE OVER THE ${change.label.toUpperCase()} (${aiDate(change.from)} to ${aiDate(change.to)}): ` +
            `value ${formatInr(change.startPaise)} → ${formatInr(change.endPaise)}` +
            `; new money in (purchases and SIPs minus redemptions) ${formatInr(change.netFlowPaise, true)}` +
            `; market movement ${movement(change.marketPaise, change.marketPct)}` +
            `; SIP installments recorded: ${change.sipInstallments}.`,
    ];

    if (!perFund) {
        for (const [label, fund] of [
            ['Moved most', change.best],
            ['Moved least', change.worst],
        ] as const) {
            if (fund) lines.push(`- ${label}: ${fund.name}: ${fundLine(fund)}`);
        }
        return lines.join('\n');
    }

    for (const fund of change.funds)
        lines.push(`- ${fund.name}: ${fundLine(fund)}`);
    return lines.join('\n');
}
