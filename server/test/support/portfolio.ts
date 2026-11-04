/**
 * Port of tests/Support/BuildsPortfolio: today is Thu 8 Oct 2026, one user
 * holding Axis Children's Fund (135762) with NAVs for every business day from
 * 2025-01-01 to 2026-10-07 (2 Oct 2026 is a holiday; 5 Oct is 29.1100).
 */
import { afterEach, beforeEach } from 'vitest';

import { addDays, isWeekday } from '../../src/lib/dates.js';
import { Decimal } from '../../src/lib/decimal.js';
import { createLogger } from '../../src/lib/logger.js';
import { setTestNow } from '../../src/lib/today.js';
import { Holding, type HoldingDoc } from '../../src/models/holding.js';
import { Scheme, type SchemeDoc } from '../../src/models/scheme.js';
import { Transaction } from '../../src/models/transaction.js';
import type { UserDoc } from '../../src/models/user.js';
import { NavLookup } from '../../src/nav/navLookup.js';
import { runSipsGenerate } from '../../src/jobs/sipsGenerate.js';
import {
    type Agent,
    createUser,
    loginAs,
    makeTestApp,
    testConfig,
} from './app.js';
import { FakeAiProvider } from './fakeAiProvider.js';
import { FakeNavProvider } from './fakeNavProvider.js';
import { createScheme } from './schemes.js';

export const AMFI_CODE = 135762;
export const TODAY = '2026-10-08T10:00:00+05:30';

/** NAVs for every weekday in the range, rising by 0.01 a day from 10.0000. */
export function businessDayNavs(
    from: string,
    to: string,
    holidays: string[] = [],
): Record<string, string> {
    const navs: Record<string, string> = {};
    let nav = '10.0000';

    for (let date = from; date <= to; date = addDays(date, 1)) {
        if (isWeekday(date) && !holidays.includes(date)) {
            navs[date] = nav;
            nav = Decimal.add(nav, '0.0100', 4);
        }
    }

    return navs;
}

export type Portfolio = {
    app: ReturnType<typeof makeTestApp>['app'];
    agent: Agent;
    user: UserDoc;
    scheme: SchemeDoc;
    holding: HoldingDoc;
    navProvider: FakeNavProvider;
    /** The app's AI model; answers with canned text. */
    ai: FakeAiProvider;
    /** "/api/holdings/<id>" for the fixture holding (or another). */
    url: (path?: string, holding?: { id: string }) => string;
    navOn: (date: string) => string;
    /** Like Laravel's publishNav(): the provider and the scheme both see the new NAV. */
    publishNav: (date: string, nav: string) => Promise<void>;
    /** Runs the sips-generate job, as hPanel cron would. */
    generateSips: () => Promise<{ created: number; failed: number }>;
};

/** Call inside a describe() that uses useTestDb(); returns a getter for the fixture. */
export function usePortfolio(): () => Portfolio {
    afterEach(() => setTestNow(null));
    let portfolio: Portfolio | undefined;

    beforeEachPortfolio((p) => {
        portfolio = p;
    });

    return () => {
        if (!portfolio) throw new Error('portfolio not built yet');
        return portfolio;
    };
}

function beforeEachPortfolio(set: (p: Portfolio) => void) {
    beforeEach(async () => set(await buildPortfolio()));
}

export async function buildPortfolio(): Promise<Portfolio> {
    setTestNow(TODAY);

    const navs = businessDayNavs('2025-01-01', '2026-10-07', ['2026-10-02']);
    navs['2026-10-05'] = '29.1100';

    const navProvider = new FakeNavProvider({ [AMFI_CODE]: navs });
    const ai = new FakeAiProvider();
    const { app, agent: newAgent } = makeTestApp({
        navProvider,
        aiProvider: ai,
    });

    const user = await createUser();
    const scheme = await createScheme({
        amfiCode: AMFI_CODE,
        name: "Axis Children's Fund - Direct Plan - Growth Option",
        latestNav: navs['2026-10-07']!,
        latestNavDate: '2026-10-07',
    });
    const holding = await Holding.create({
        userId: user._id,
        schemeId: scheme._id,
    });
    const agent = await loginAs(newAgent(), user);

    const config = testConfig();
    const ctx = {
        navs: new NavLookup(navProvider),
        logger: createLogger(config),
    };

    return {
        app,
        agent,
        user,
        scheme,
        holding,
        navProvider,
        ai,
        url: (path = '', h = holding) => `/api/holdings/${h.id}${path}`,
        navOn: (date) => {
            const nav = navProvider.navs[AMFI_CODE]![date];
            if (!nav) throw new Error(`no NAV on ${date}`);
            return nav;
        },
        publishNav: async (date, nav) => {
            navProvider.navs[AMFI_CODE]![date] = nav;
            await Scheme.updateOne(
                { _id: scheme._id },
                { latestNav: nav, latestNavDate: date },
            );
        },
        generateSips: () => runSipsGenerate(ctx),
    };
}

/** Another user's holding of a fresh scheme (Holding::factory()->for(User::factory())). */
export async function createForeignHolding(
    owner?: UserDoc,
    scheme?: SchemeDoc,
): Promise<HoldingDoc> {
    const user = owner ?? (await createUser());
    const s = scheme ?? (await createScheme());
    return Holding.create({ userId: user._id, schemeId: s._id });
}

/** A purchase on a holding (Transaction::factory()). */
export function createTransaction(holding: HoldingDoc) {
    return Transaction.create({
        holdingId: holding._id,
        userId: holding.userId,
        type: 'purchase',
        txnDate: '2026-10-05',
        navDate: '2026-10-05',
        nav: '10.0000',
        amountPaise: 100000,
        stampDutyPaise: 5,
        units: '9.999',
    });
}
