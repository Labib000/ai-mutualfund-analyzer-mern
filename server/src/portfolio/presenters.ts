import type { SchemeSummary, SipJson, TransactionJson } from '@hisaab/shared';
import type { Types } from 'mongoose';

import { addMonthsNoOverflow } from '../lib/dates.js';
import type { SchemeFields } from '../models/scheme.js';
import { type SipFields, isSipRunningOn } from '../models/sip.js';
import type { TransactionFields } from '../models/transaction.js';
import { sipDueDates } from './sipSchedule.js';

type WithId<T> = T & { _id: Types.ObjectId };

/** The scheme fields every portfolio page shows (SchemePresenter::summary). */
export function schemeSummary(scheme: WithId<SchemeFields>): SchemeSummary {
    return {
        id: String(scheme._id),
        name: scheme.name,
        amc: scheme.amc,
        category: scheme.category,
        plan: scheme.plan ?? null,
        latestNav: scheme.latestNav ?? null,
        latestNavDate: scheme.latestNavDate ?? null,
    };
}

export function transactionJson(t: WithId<TransactionFields>): TransactionJson {
    return {
        id: String(t._id),
        type: t.type,
        txnDate: t.txnDate,
        navDate: t.navDate,
        nav: t.nav,
        amountPaise: t.amountPaise,
        stampDutyPaise: t.stampDutyPaise,
        units: t.units,
        unitsOverridden: t.unitsOverridden,
        fromSip: t.sipId !== undefined && t.sipId !== null,
    };
}

/**
 * The next installment not yet recorded. It can be in the past when its NAV
 * hasn't been published yet.
 */
function nextDue(sip: SipFields, today: string): string | null {
    if (!isSipRunningOn(sip, today)) return null;

    const horizon = addMonthsNoOverflow(
        today > sip.startDate ? today : sip.startDate,
        2,
    );

    return (
        sipDueDates({
            day: sip.dayOfMonth,
            start: sip.startDate,
            end: sip.endDate ?? null,
            after: sip.generatedUntil ?? null,
            until: horizon,
        })[0] ?? null
    );
}

export function sipJson(sip: WithId<SipFields>, today: string): SipJson {
    return {
        id: String(sip._id),
        amountPaise: sip.amountPaise,
        dayOfMonth: sip.dayOfMonth,
        startDate: sip.startDate,
        endDate: sip.endDate ?? null,
        isRunning: isSipRunningOn(sip, today),
        nextDue: nextDue(sip, today),
        earliestEndDate: sip.generatedUntil ?? sip.startDate,
    };
}
