/** Converts between money and units the way registrars do (port of App\Portfolio\UnitCalculator). */
import { Decimal } from '../lib/decimal.js';

/** Stamp duty on mutual fund purchases since 1 July 2020: 0.005%. */
const STAMP_DUTY_PER_100000 = 5;

export const UNITS_SCALE = 3;

function assertPaise(value: number, name: string): void {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${name} must be a whole number of paise.`);
    }
}

function positive(value: string, name: string): string {
    if (!Decimal.isNumeric(value) || Decimal.compare(value, '0') <= 0) {
        throw new RangeError(`${name} must be a positive decimal number.`);
    }
    return value;
}

/** Stamp duty on a purchase, rounded half-up to the paisa (₹10,000 → 50 paise). */
export function stampDuty(amountPaise: number): number {
    assertPaise(amountPaise, 'Amount');
    if (amountPaise < 0) throw new RangeError('Amount cannot be negative.');

    return Math.floor((amountPaise * STAMP_DUTY_PER_100000 + 50_000) / 100_000);
}

/** Units allotted for a purchase: (amount − stamp duty) ÷ NAV, rounded to 3 decimals. */
export function purchaseUnits(
    amountPaise: number,
    stampDutyPaise: number,
    nav: string,
): string {
    positive(nav, 'NAV');
    assertPaise(amountPaise, 'Amount');
    assertPaise(stampDutyPaise, 'Stamp duty');

    if (stampDutyPaise < 0 || stampDutyPaise > amountPaise) {
        throw new RangeError('Stamp duty must be between zero and the amount.');
    }

    const netRupees = Decimal.div(
        String(amountPaise - stampDutyPaise),
        '100',
        2,
    );
    return Decimal.round(Decimal.div(netRupees, nav, 10), UNITS_SCALE);
}

/** Value of units at a NAV, in paise rounded half-up. */
export function redemptionAmount(units: string, nav: string): number {
    positive(units, 'Units');
    positive(nav, 'NAV');

    return Number(
        Decimal.round(Decimal.mul(Decimal.mul(units, nav, 7), '100', 5), 0),
    );
}
