/** Returns for one fund or a whole portfolio (port of App\Portfolio\Performance). Money is in paise. */
import type { PerformanceJson, XirrStatus } from '@hisaab/shared';

import { roundFloat } from '../lib/decimal.js';

/** One purchase, SIP installment or redemption, as the calculators need it. */
export type Movement = {
    /** "YYYY-MM-DD". */
    date: string;
    addsUnits: boolean;
    /** 3 dp string. */
    units: string;
    /** Invested for purchases, received for redemptions. */
    amountPaise: number;
};

/** A fund's movements and the NAV to value it at. */
export type HoldingInput = {
    movements: readonly Movement[];
    latestNav: string | null;
    latestNavDate: string | null;
};

export class Performance {
    constructor(
        /** Null for a portfolio, which mixes funds. */
        readonly unitsHeld: string | null,
        readonly investedPaise: number,
        readonly valuePaise: number,
        readonly realisedGainPaise: number,
        readonly xirr: number | null,
        readonly xirrStatus: XirrStatus,
        readonly valuedOn: string | null,
    ) {}

    /** Current value minus the cost of units held. */
    get unrealisedGainPaise(): number {
        return this.valuePaise - this.investedPaise;
    }

    get totalGainPaise(): number {
        return this.unrealisedGainPaise + this.realisedGainPaise;
    }

    /** Unrealised gain as a percentage of the cost of units held, or null when nothing is held. */
    get absoluteReturnPct(): number | null {
        return this.investedPaise > 0
            ? (this.unrealisedGainPaise / this.investedPaise) * 100
            : null;
    }

    toJSON(): PerformanceJson {
        const absoluteReturn = this.absoluteReturnPct;

        return {
            unitsHeld: this.unitsHeld,
            investedPaise: this.investedPaise,
            valuePaise: this.valuePaise,
            unrealisedGainPaise: this.unrealisedGainPaise,
            realisedGainPaise: this.realisedGainPaise,
            totalGainPaise: this.totalGainPaise,
            absoluteReturnPct:
                absoluteReturn === null ? null : roundFloat(absoluteReturn, 2),
            xirrPct: this.xirr === null ? null : roundFloat(this.xirr * 100, 2),
            xirrStatus: this.xirrStatus,
            valuedOn: this.valuedOn,
        };
    }
}
