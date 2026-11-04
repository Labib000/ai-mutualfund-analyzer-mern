/**
 * Splits a portfolio's change in value over a period into new money (net
 * purchases and redemptions) and market movement (everything else). Port of
 * App\Portfolio\PortfolioChange, ChangeFund, PortfolioChangeResult and the
 * ChangePeriod enum.
 *
 * Values use the latest NAV on or before each end of the period, as everywhere
 * else in valuation; movements on the start date belong to the start value.
 */
import type {
    ChangeFundJson,
    ChangePeriod,
    PortfolioChangeJson,
} from '@hisaab/shared';

import { addDays } from '../lib/dates.js';
import { Decimal, roundFloat } from '../lib/decimal.js';
import type { HoldingInput } from './performance.js';
import { UNITS_SCALE, redemptionAmount } from './unitCalculator.js';

const LABELS: Record<ChangePeriod, string> = {
    '7d': 'last 7 days',
    '30d': 'last 30 days',
    month: 'this month so far',
};

/** The valuation date a period ending on `end` is measured from. */
export function periodStart(period: ChangePeriod, end: string): string {
    switch (period) {
        case '7d':
            return addDays(end, -7);
        case '30d':
            return addDays(end, -30);
        case 'month':
            // Closing value of the previous month.
            return addDays(`${end.slice(0, 8)}01`, -1);
    }
}

export type ChangeInput = {
    name: string;
    input: HoldingInput;
    /** NAVs keyed by "YYYY-MM-DD". */
    navs: Readonly<Record<string, string>>;
};

type ChangeFund = {
    name: string;
    startPaise: number;
    endPaise: number;
    netFlowPaise: number;
};

const marketPaise = (f: ChangeFund) =>
    f.endPaise - f.startPaise - f.netFlowPaise;
const marketPct = (f: ChangeFund) =>
    f.startPaise > 0 ? (marketPaise(f) / f.startPaise) * 100 : null;
const round2 = (pct: number | null) =>
    pct === null ? null : roundFloat(pct, 2);

function fundJson(f: ChangeFund): ChangeFundJson {
    return {
        ...f,
        marketPaise: marketPaise(f),
        marketPct: round2(marketPct(f)),
    };
}

/** @param sipInstallments Installments recorded in the period, counted by the caller. */
export function changeOver(
    period: ChangePeriod,
    end: string,
    funds: readonly ChangeInput[],
    sipInstallments = 0,
): PortfolioChangeJson {
    const to = end;
    const from = periodStart(period, end);
    const changes: ChangeFund[] = [];

    for (const { name, input, navs } of funds) {
        const dates = Object.keys(navs).sort();
        const startPaise = valueOn(input, navs, dates, from);
        const endPaise = valueOn(input, navs, dates, to);
        let netFlowPaise = 0;

        for (const m of input.movements) {
            if (m.date > from && m.date <= to) {
                netFlowPaise += m.addsUnits ? m.amountPaise : -m.amountPaise;
            }
        }

        if (startPaise !== 0 || endPaise !== 0 || netFlowPaise !== 0) {
            changes.push({ name, startPaise, endPaise, netFlowPaise });
        }
    }

    changes.sort((a, b) => b.endPaise - a.endPaise);

    const total: ChangeFund = {
        name: '',
        startPaise: sum(changes, (f) => f.startPaise),
        endPaise: sum(changes, (f) => f.endPaise),
        netFlowPaise: sum(changes, (f) => f.netFlowPaise),
    };

    // Funds held at the start, by market movement as a percentage, highest first.
    const ranked = changes
        .filter((f) => f.startPaise > 0)
        .sort((a, b) => marketPct(b)! - marketPct(a)!);

    return {
        period,
        label: LABELS[period],
        from,
        to,
        startPaise: total.startPaise,
        endPaise: total.endPaise,
        netFlowPaise: total.netFlowPaise,
        marketPaise: marketPaise(total),
        marketPct: round2(marketPct(total)),
        sipInstallments,
        best: ranked[0] ? fundJson(ranked[0]) : null,
        worst: ranked.length > 1 ? fundJson(ranked[ranked.length - 1]!) : null,
        funds: changes.map(fundJson),
    };
}

/** Units held at the end of the date, at the latest NAV on or before it. */
function valueOn(
    input: HoldingInput,
    navs: Readonly<Record<string, string>>,
    dates: readonly string[],
    date: string,
): number {
    let units = '0';
    for (const m of input.movements) {
        if (m.date <= date) {
            units = m.addsUnits
                ? Decimal.add(units, m.units, UNITS_SCALE)
                : Decimal.sub(units, m.units, UNITS_SCALE);
        }
    }

    let nav: string | null = null;
    for (const navDate of dates) {
        if (navDate > date) break;
        nav = navs[navDate]!;
    }

    if (
        nav === null ||
        !Decimal.isNumeric(nav) ||
        Decimal.compare(units, '0') <= 0
    ) {
        return 0;
    }

    return redemptionAmount(units, nav);
}

function sum(
    funds: readonly ChangeFund[],
    pick: (f: ChangeFund) => number,
): number {
    return funds.reduce((total, f) => total + pick(f), 0);
}
