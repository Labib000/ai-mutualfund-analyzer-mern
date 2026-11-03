/**
 * Works out invested amount (FIFO cost of units held), current value, gains
 * and XIRR for a fund or a portfolio (port of App\Portfolio\PerformanceCalculator).
 */
import type { XirrStatus } from '@hisaab/shared';

import { epochDay } from '../lib/dates.js';
import { Decimal } from '../lib/decimal.js';
import { FifoLots } from './fifoLots.js';
import {
    type HoldingInput,
    type Movement,
    Performance,
} from './performance.js';
import { redemptionAmount } from './unitCalculator.js';
import { type CashFlow, xirr } from './xirr.js';

/** XIRR isn't shown until the first investment is this old. */
export const MIN_XIRR_DAYS = 30;

/** Below this, XIRR is annualised from a short period. */
export const FULL_YEAR_DAYS = 365;

export function holdingPerformance(holding: HoldingInput): Performance {
    return evaluate(holding).performance;
}

export function portfolioPerformance(
    holdings: readonly HoldingInput[],
): Performance {
    let invested = 0;
    let value = 0;
    let realised = 0;
    let valuedOn: string | null = null;
    const flows: CashFlow[] = [];

    for (const holding of holdings) {
        const { performance, flows: holdingFlows } = evaluate(holding);

        invested += performance.investedPaise;
        value += performance.valuePaise;
        realised += performance.realisedGainPaise;
        flows.push(...holdingFlows);

        if (
            performance.valuedOn !== null &&
            (valuedOn === null || performance.valuedOn > valuedOn)
        ) {
            valuedOn = performance.valuedOn;
        }
    }

    const [rate, status] = xirrWithStatus(flows);
    return new Performance(
        null,
        invested,
        value,
        realised,
        rate,
        status,
        valuedOn,
    );
}

function evaluate(holding: HoldingInput): {
    performance: Performance;
    flows: CashFlow[];
} {
    // Same-day purchases come before redemptions, as in UnitLedger.
    const movements = [...holding.movements].sort((a: Movement, b: Movement) =>
        a.date !== b.date
            ? a.date < b.date
                ? -1
                : 1
            : Number(!a.addsUnits) - Number(!b.addsUnits),
    );

    const lots = new FifoLots();
    const flows: CashFlow[] = [];

    for (const movement of movements) {
        if (movement.addsUnits) {
            lots.buy(movement.units, movement.amountPaise);
            flows.push({
                date: movement.date,
                amountPaise: -movement.amountPaise,
            });
        } else {
            lots.sell(movement.units, movement.amountPaise);
            flows.push({
                date: movement.date,
                amountPaise: movement.amountPaise,
            });
        }
    }

    const unitsHeld = lots.unitsHeld();
    let value = 0;

    if (holding.latestNav !== null && Decimal.compare(unitsHeld, '0') > 0) {
        value = redemptionAmount(unitsHeld, holding.latestNav);
    }

    if (value > 0 && holding.latestNavDate !== null) {
        flows.push({ date: holding.latestNavDate, amountPaise: value });
    }

    const [rate, status] = xirrWithStatus(flows);
    const valuedOn = value > 0 ? holding.latestNavDate : null;

    return {
        performance: new Performance(
            unitsHeld,
            lots.costPaise(),
            value,
            lots.realisedGainPaise(),
            rate,
            status,
            valuedOn,
        ),
        flows,
    };
}

function xirrWithStatus(flows: CashFlow[]): [number | null, XirrStatus] {
    if (flows.length === 0) return [null, 'not_meaningful'];

    const days = flows.map((flow) => epochDay(flow.date));
    const span = Math.max(...days) - Math.min(...days);

    if (span < MIN_XIRR_DAYS) return [null, 'too_recent'];

    const rate = xirr(flows);
    if (rate === null) return [null, 'not_meaningful'];

    return [rate, span < FULL_YEAR_DAYS ? 'short_period' : 'ok'];
}
