/**
 * Load-test data: many verified users with years of transactions, on synthetic
 * schemes that have a full NAV history already stored (so no mfapi.in calls).
 *
 *   npm run db:seed:load                        # 50 users × 10 funds × 3 years
 *   npm run db:seed:load -- --users=200 --holdings=15 --years=5
 *   npm run db:seed:load -- --reset             # only remove the load data
 *   npm run db:seed:load -- --clear-cache       # only empty the cache (cold-cache runs)
 *
 * Users are load-user-<n>@load.test / password; schemes have AMFI codes from
 * 990001. Re-running replaces the previous load data. Writes the users and
 * scheme ids for the k6 scripts to server/load/data/seed.json.
 * Refuses to run in production. Best pointed at its own database.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import mongoose, { type Types } from 'mongoose';

import { hashPassword } from '../auth/password.js';
import { SESSION_COLLECTION } from '../auth/sessions.js';
import { ConfigError, loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { addDays, addMonthsNoOverflow, isWeekday } from '../lib/dates.js';
import { cacheForgetPrefix } from '../lib/cache.js';
import { Decimal } from '../lib/decimal.js';
import { REPO_ROOT } from '../lib/paths.js';
import { connectRedisForCli, disconnectRedis } from '../lib/redis.js';
import { now, today } from '../lib/today.js';
import { AiUsage } from '../models/aiUsage.js';
import { Avatar } from '../models/avatar.js';
import { Holding } from '../models/holding.js';
import { NavHistory } from '../models/navHistory.js';
import { Scheme } from '../models/scheme.js';
import { Sip } from '../models/sip.js';
import { Transaction } from '../models/transaction.js';
import { User } from '../models/user.js';
import {
    purchaseUnits,
    redemptionAmount,
    stampDuty,
} from '../portfolio/unitCalculator.js';

const EMAIL_DOMAIN = 'load.test';
const PASSWORD = 'password';
const FIRST_AMFI_CODE = 990_001;
const SCHEME_COUNT = 20;
/** Six years of NAVs, so 1, 3 and 5-year fund facts all have data. */
const NAV_YEARS = 6;
const CHUNK = 5_000;

const CATEGORIES = [
    'Equity Scheme - Flexi Cap Fund',
    'Equity Scheme - Large Cap Fund',
    'Equity Scheme - Mid Cap Fund',
    'Equity Scheme - Small Cap Fund',
    'Equity Scheme - ELSS',
    'Debt Scheme - Liquid Fund',
    'Debt Scheme - Short Duration Fund',
    'Hybrid Scheme - Aggressive Hybrid Fund',
    'Other Scheme - Index Funds',
    'Hybrid Scheme - Balanced Advantage',
];
const AMCS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map(
    (n) => `Load Test ${n} Mutual Fund`,
);

const outFile = path.join(REPO_ROOT, 'server/load/data/seed.json');

/** Deterministic PRNG (mulberry32), so every run builds the same data. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function lastWeekdayBefore(date: string): string {
    let d = addDays(date, -1);
    while (!isWeekday(d)) d = addDays(d, -1);
    return d;
}

function nextWeekdayFrom(date: string): string {
    let d = date;
    while (!isWeekday(d)) d = addDays(d, 1);
    return d;
}

/** A random walk of daily NAVs on weekdays, as 4 dp strings. */
function navSeries(
    from: string,
    to: string,
    random: () => number,
    debt: boolean,
): Map<string, string> {
    const drift = debt ? 0.00025 : 0.0005;
    const vol = debt ? 0.0008 : 0.011;
    const navs = new Map<string, string>();
    let nav = 10 + random() * 90;

    for (let d = from; d <= to; d = addDays(d, 1)) {
        if (!isWeekday(d)) continue;
        // Sum of uniforms ≈ normal; good enough for test data.
        const shock = (random() + random() + random() - 1.5) * 2 * vol;
        nav = Math.max(1, nav * (1 + drift + shock));
        navs.set(d, nav.toFixed(4));
    }

    return navs;
}

async function removeLoadData(): Promise<void> {
    const users = await User.find(
        { email: { $regex: `@${EMAIL_DOMAIN.replace('.', '\\.')}$` } },
        { _id: 1 },
    ).lean();
    const userIds = users.map((u) => u._id);
    const schemes = await Scheme.find(
        { amfiCode: { $gte: FIRST_AMFI_CODE, $lt: FIRST_AMFI_CODE + 1000 } },
        { _id: 1 },
    ).lean();
    const schemeIds = schemes.map((s) => s._id);

    await Promise.all([
        Transaction.deleteMany({ userId: { $in: userIds } }),
        Sip.deleteMany({ userId: { $in: userIds } }),
        Holding.deleteMany({ userId: { $in: userIds } }),
        AiUsage.deleteMany({ userId: { $in: userIds } }),
        Avatar.deleteMany({ userId: { $in: userIds } }),
        mongoose.connection
            .collection(SESSION_COLLECTION)
            .deleteMany({ 'session.userId': { $in: userIds.map(String) } }),
        NavHistory.deleteMany({ schemeId: { $in: schemeIds } }),
    ]);
    await User.deleteMany({ _id: { $in: userIds } });
    await Scheme.deleteMany({ _id: { $in: schemeIds } });
    await cacheForgetPrefix('');

    console.log(
        `Removed ${userIds.length} load users and ${schemeIds.length} load schemes; emptied the cache.`,
    );
}

async function seed(opts: {
    users: number;
    holdings: number;
    years: number;
}): Promise<void> {
    const random = rng(42);
    const todayDate = today();
    const lastNavDate = lastWeekdayBefore(todayDate);
    const navFrom = addMonthsNoOverflow(todayDate, -12 * NAV_YEARS);
    const txnFrom = addMonthsNoOverflow(todayDate, -12 * opts.years);

    // Schemes and their NAV history.
    const navsByScheme = new Map<string, Map<string, string>>();
    const schemeIds: Types.ObjectId[] = [];

    for (let i = 0; i < SCHEME_COUNT; i++) {
        const category = CATEGORIES[i % CATEGORIES.length]!;
        const navs = navSeries(
            navFrom,
            lastNavDate,
            random,
            category.startsWith('Debt'),
        );
        const scheme = await Scheme.create({
            amfiCode: FIRST_AMFI_CODE + i,
            name: `Load Test Fund ${i + 1} - Direct Plan - Growth`,
            amc: AMCS[i % AMCS.length]!,
            schemeType: 'open_ended',
            category,
            plan: 'direct',
            latestNav: navs.get(lastNavDate)!,
            latestNavDate: lastNavDate,
            isActive: true,
            historySyncedAt: now(),
        });
        schemeIds.push(scheme._id);
        navsByScheme.set(String(scheme._id), navs);

        const rows = [...navs].map(([navDate, nav]) => ({
            schemeId: scheme._id,
            navDate,
            nav,
        }));
        for (let j = 0; j < rows.length; j += CHUNK) {
            await NavHistory.insertMany(rows.slice(j, j + CHUNK), {
                ordered: false,
                lean: true,
            });
        }
    }

    // Users, each holding a different mix of the schemes.
    const passwordHash = await hashPassword(PASSWORD);
    const users = await User.insertMany(
        Array.from({ length: opts.users }, (_, i) => ({
            name: `Load User ${i + 1}`,
            email: `load-user-${i + 1}@${EMAIL_DOMAIN}`,
            passwordHash,
            emailVerifiedAt: now(),
        })),
    );

    let transactionCount = 0;
    let pending: Record<string, unknown>[] = [];
    const flush = async () => {
        if (pending.length === 0) return;
        await Transaction.insertMany(pending, { ordered: false, lean: true });
        transactionCount += pending.length;
        pending = [];
    };

    for (const [u, user] of users.entries()) {
        const picks = [...schemeIds]
            .map((id) => ({ id, sort: random() }))
            .sort((a, b) => a.sort - b.sort)
            .slice(0, Math.min(opts.holdings, SCHEME_COUNT));

        for (const { id: schemeId } of picks) {
            const holding = await Holding.create({
                userId: user._id,
                schemeId,
            });
            const navs = navsByScheme.get(String(schemeId))!;
            const day = 1 + Math.floor(random() * 28);
            const monthly = (2 + Math.floor(random() * 48)) * 500 * 100;
            const redeemAt = addMonthsNoOverflow(
                txnFrom,
                Math.floor(opts.years * 12 * (0.5 + random() * 0.3)),
            );
            let held = '0.000';
            let redeemed = false;

            for (
                let date = `${txnFrom.slice(0, 8)}${String(day).padStart(2, '0')}`;
                date < todayDate;
                date = addMonthsNoOverflow(date, 1)
            ) {
                const navDate = nextWeekdayFrom(date);
                const nav = navs.get(navDate);
                if (!nav) continue;

                if (!redeemed && date >= redeemAt) {
                    // Sell a fifth of what's held: realised gains for FIFO.
                    const units = Decimal.mul(held, '0.2', 3);
                    if (Decimal.compare(units, '0') > 0) {
                        pending.push({
                            holdingId: holding._id,
                            userId: user._id,
                            type: 'redemption',
                            txnDate: date,
                            navDate,
                            nav,
                            amountPaise: redemptionAmount(units, nav),
                            stampDutyPaise: 0,
                            units,
                            unitsOverridden: false,
                        });
                        held = Decimal.sub(held, units, 3);
                    }
                    redeemed = true;
                    continue;
                }

                const duty = stampDuty(monthly);
                const units = purchaseUnits(monthly, duty, nav);
                pending.push({
                    holdingId: holding._id,
                    userId: user._id,
                    type: 'purchase',
                    txnDate: date,
                    navDate,
                    nav,
                    amountPaise: monthly,
                    stampDutyPaise: duty,
                    units,
                    unitsOverridden: false,
                });
                held = Decimal.add(held, units, 3);
            }

            if (pending.length >= CHUNK) await flush();
        }

        if ((u + 1) % 25 === 0) console.log(`  ${u + 1}/${users.length} users`);
    }
    await flush();

    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(
        outFile,
        JSON.stringify(
            {
                password: PASSWORD,
                users: users.map((u) => u.email),
                schemeIds: schemeIds.map(String),
            },
            null,
            2,
        ),
    );

    console.log(
        `Seeded ${users.length} users, ${users.length * Math.min(opts.holdings, SCHEME_COUNT)} holdings, ` +
            `${transactionCount} transactions and ${SCHEME_COUNT} schemes with NAVs to ${lastNavDate}.\n` +
            `Wrote ${path.relative(REPO_ROOT, outFile)}.`,
    );
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            users: { type: 'string', default: '50' },
            holdings: { type: 'string', default: '10' },
            years: { type: 'string', default: '3' },
            reset: { type: 'boolean', default: false },
            'clear-cache': { type: 'boolean', default: false },
        },
    });

    let config;
    try {
        config = loadConfig();
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(error.message);
            process.exit(1);
        }
        throw error;
    }

    if (config.NODE_ENV === 'production') {
        console.error('Refusing to seed load-test data in production.');
        process.exit(1);
    }

    const users = Number(values.users);
    const holdings = Number(values.holdings);
    const years = Number(values.years);
    if (
        ![users, holdings, years].every((n) => Number.isInteger(n) && n > 0) ||
        years > NAV_YEARS - 1
    ) {
        console.error(
            `--users, --holdings and --years must be positive integers; --years at most ${NAV_YEARS - 1}.`,
        );
        process.exit(1);
    }

    const connection = await connectDb(config.MONGODB_URI);
    console.log(`Database "${connection.connection.name}"`);

    // The cache may also live in Redis (R2): clear it there too.
    if (!(await connectRedisForCli(config.REDIS_URL))) {
        await disconnectDb();
        process.exit(1);
    }
    if (config.REDIS_URL) {
        console.log('Redis connected: its cache is cleared too.');
    }

    try {
        if (values['clear-cache']) {
            const deleted = await cacheForgetPrefix('');
            console.log(`Emptied the cache (${deleted} entries).`);
            return;
        }

        await removeLoadData();
        if (!values.reset) await seed({ users, holdings, years });
    } finally {
        await disconnectRedis();
        await disconnectDb();
    }
}

void main();
