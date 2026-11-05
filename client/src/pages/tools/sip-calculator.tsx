import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { motion, useInView } from 'motion/react';
import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { Head } from '@/components/head';
import AnimatedNumber from '@/components/sip-calculator/animated-number';
import BreakdownDonut from '@/components/sip-calculator/breakdown-donut';
import GrowthChart from '@/components/sip-calculator/growth-chart';
import MilestoneTimeline from '@/components/sip-calculator/milestone-timeline';
import SliderField from '@/components/sip-calculator/slider-field';
import YearTable from '@/components/sip-calculator/year-table';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { formatCompactPaise, formatRupees } from '@/lib/format';
import {
    milestones as findMilestones,
    projectSip,
    realValue,
    requiredMonthly,
} from '@/lib/sip-calculator';
import { cn } from '@/lib/utils';

type Mode = 'amount' | 'goal';

/** Every input, with its range and default; all of them live in the URL. */
const FIELDS = {
    monthly: { min: 500, max: 5_00_000, step: 500, fallback: 10_000 },
    target: {
        min: 1_00_000,
        max: 50_00_00_000,
        step: 10_000,
        fallback: 1_00_00_000,
    },
    rate: { min: 1, max: 30, step: 0.5, fallback: 12 },
    years: { min: 1, max: 40, step: 1, fallback: 15 },
    stepup: { min: 0, max: 25, step: 1, fallback: 0 },
    inflation: { min: 0, max: 10, step: 0.5, fallback: 6 },
} as const;
type Field = keyof typeof FIELDS;

const MODES: { value: Mode; label: string }[] = [
    { value: 'amount', label: 'I can invest' },
    { value: 'goal', label: 'I want to reach' },
];

const RETURN_PRESETS = [
    { label: 'Debt', rate: 7 },
    { label: 'Hybrid', rate: 9 },
    { label: 'Equity', rate: 12 },
    { label: 'Small cap', rate: 15 },
];

const short = (rupees: number) => formatCompactPaise(Math.round(rupees) * 100);
const plainNumber = (v: number) => v.toLocaleString('en-IN');

export default function SipCalculator() {
    const [params, setParams] = useSearchParams();
    const mode: Mode = params.get('mode') === 'goal' ? 'goal' : 'amount';

    const read = (field: Field) => {
        const { min, max, fallback } = FIELDS[field];
        const raw = Number(params.get(field));
        return params.has(field) && Number.isFinite(raw)
            ? Math.min(max, Math.max(min, raw))
            : fallback;
    };
    const monthlyInput = read('monthly');
    const target = read('target');
    const rate = read('rate');
    const years = read('years');
    const stepUp = read('stepup');
    const inflation = read('inflation');

    const set = useCallback(
        (changes: Partial<Record<Field | 'mode', number | string>>) =>
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    for (const [key, value] of Object.entries(changes))
                        next.set(key, String(value));
                    return next;
                },
                { replace: true },
            ),
        [setParams],
    );

    const monthly =
        mode === 'goal'
            ? requiredMonthly({
                  target,
                  annualReturnPct: rate,
                  years,
                  stepUpPct: stepUp,
              })
            : monthlyInput;
    const projection = useMemo(
        () =>
            projectSip({
                monthly,
                annualReturnPct: rate,
                years,
                stepUpPct: stepUp,
            }),
        [monthly, rate, years, stepUp],
    );
    const marks = useMemo(
        () => findMilestones(projection.series, 4),
        [projection.series],
    );
    const todaysMoney = realValue(projection.value, inflation, years);
    const yearsLabel = `${years} ${years === 1 ? 'year' : 'years'}`;

    const hero = useRef<HTMLDivElement>(null);
    const heroVisible = useInView(hero, { margin: '0px 0px -80px 0px' });

    return (
        <>
            <Head title="SIP calculator" />

            <div className="flex flex-1 flex-col gap-4 p-4 pb-24 sm:gap-6 md:p-6 lg:pb-6">
                <header className="space-y-1">
                    <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                        SIP calculator
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        See how a monthly SIP could grow, or what it takes to
                        reach a goal.
                    </p>
                </header>

                <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-12">
                    {/* Inputs */}
                    <Card className="lg:sticky lg:top-20 lg:col-span-5">
                        <CardContent className="space-y-7">
                            <div
                                role="radiogroup"
                                aria-label="What do you want to work out?"
                                className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
                            >
                                {MODES.map((m) => {
                                    const active = mode === m.value;
                                    return (
                                        <button
                                            key={m.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() =>
                                                set({ mode: m.value })
                                            }
                                            className={cn(
                                                'relative h-9 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                active
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {active && (
                                                <motion.span
                                                    layoutId="sip-mode"
                                                    className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border"
                                                    transition={{
                                                        type: 'spring',
                                                        bounce: 0.15,
                                                        duration: 0.35,
                                                    }}
                                                />
                                            )}
                                            <span className="relative">
                                                {m.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {mode === 'amount' ? (
                                <SliderField
                                    label="Monthly investment"
                                    value={monthlyInput}
                                    onChange={(v) => set({ monthly: v })}
                                    {...FIELDS.monthly}
                                    scale="log"
                                    prefix="₹"
                                    format={plainNumber}
                                    marks={['₹500', '₹5 L']}
                                />
                            ) : (
                                <SliderField
                                    label="Target amount"
                                    value={target}
                                    onChange={(v) => set({ target: v })}
                                    {...FIELDS.target}
                                    scale="log"
                                    prefix="₹"
                                    format={plainNumber}
                                    marks={['₹1 L', '₹50 Cr']}
                                    hint={short(target)}
                                />
                            )}

                            <div className="space-y-3">
                                <SliderField
                                    label="Expected return (yearly)"
                                    value={rate}
                                    onChange={(v) => set({ rate: v })}
                                    {...FIELDS.rate}
                                    suffix="%"
                                    format={(v) => String(v)}
                                    marks={['1%', '30%']}
                                />
                                <div className="flex flex-wrap gap-1.5">
                                    {RETURN_PRESETS.map((preset) => {
                                        const active = rate === preset.rate;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() =>
                                                    set({ rate: preset.rate })
                                                }
                                                aria-pressed={active}
                                                className={cn(
                                                    'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                    active
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                                                )}
                                            >
                                                {preset.label}{' '}
                                                <span className="tabular-nums">
                                                    {preset.rate}%
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <SliderField
                                label="Time period"
                                value={years}
                                onChange={(v) => set({ years: v })}
                                {...FIELDS.years}
                                suffix={years === 1 ? 'yr' : 'yrs'}
                                format={(v) => String(v)}
                                marks={['1 yr', '40 yrs']}
                            />

                            <SliderField
                                label="Yearly step-up"
                                value={stepUp}
                                onChange={(v) => set({ stepup: v })}
                                {...FIELDS.stepup}
                                suffix="%"
                                format={(v) => String(v)}
                                marks={['0%', '25%']}
                                hint={
                                    stepUp > 0
                                        ? 'SIP rises each year'
                                        : 'Flat SIP'
                                }
                            />
                        </CardContent>
                    </Card>

                    {/* Results */}
                    <div className="@container space-y-4 sm:space-y-6 lg:col-span-7">
                        <div
                            ref={hero}
                            className="rounded-xl border bg-gradient-to-b from-primary/10 to-card p-5 sm:p-7"
                        >
                            {mode === 'amount' ? (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Investing {formatRupees(monthlyInput)} a
                                        month for {yearsLabel}
                                        {stepUp > 0
                                            ? `, rising ${stepUp}% a year`
                                            : ''}
                                        , you could have
                                    </p>
                                    <AnimatedNumber
                                        value={projection.value}
                                        format={formatRupees}
                                        className="mt-2 block font-display text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"
                                    />
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        To reach {formatRupees(target)} in{' '}
                                        {yearsLabel}, invest
                                    </p>
                                    <p className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                                        <AnimatedNumber
                                            value={monthly}
                                            format={formatRupees}
                                            className="tabular-nums"
                                        />
                                        <span className="ml-1 text-lg font-normal text-muted-foreground sm:text-xl">
                                            /month
                                        </span>
                                    </p>
                                    {stepUp > 0 && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            in the first year, rising {stepUp}%
                                            every year
                                        </p>
                                    )}
                                </>
                            )}

                            <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-4 sm:max-w-md">
                                <Stat label="Growth">
                                    <span className="tabular-nums">
                                        {projection.multiplier.toFixed(1)}×
                                    </span>{' '}
                                    <span className="font-normal text-muted-foreground">
                                        your money
                                    </span>
                                </Stat>
                                <Stat
                                    label={
                                        <>
                                            In today's money at{' '}
                                            <select
                                                value={inflation}
                                                onChange={(e) =>
                                                    set({
                                                        inflation: Number(
                                                            e.target.value,
                                                        ),
                                                    })
                                                }
                                                aria-label="Inflation rate"
                                                className="cursor-pointer rounded bg-transparent text-foreground underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {[0, 3, 4, 5, 6, 7, 8, 10].map(
                                                    (p) => (
                                                        <option
                                                            key={p}
                                                            value={p}
                                                            className="bg-popover"
                                                        >
                                                            {p}%
                                                        </option>
                                                    ),
                                                )}
                                            </select>{' '}
                                            inflation
                                        </>
                                    }
                                >
                                    <span className="tabular-nums">
                                        ≈ {short(todaysMoney)}
                                    </span>
                                </Stat>
                            </dl>
                        </div>

                        <div className="grid gap-4 sm:gap-6 @2xl:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Where it comes from</CardTitle>
                                    <CardDescription>
                                        What you put in and what the market
                                        adds.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <BreakdownDonut
                                        invested={projection.invested}
                                        gain={projection.gain}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Milestones</CardTitle>
                                    <CardDescription>
                                        Key moments along the way.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <MilestoneTimeline
                                        milestones={marks}
                                        years={years}
                                        finalValue={projection.value}
                                        monthly={formatRupees(monthly)}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Growth over time</CardTitle>
                                <CardDescription>
                                    Value at the end of each year against the
                                    total you put in.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                    <Legend
                                        color="var(--primary)"
                                        label="Value"
                                    />
                                    <Legend
                                        color="var(--muted-foreground)"
                                        label="Invested"
                                        dashed
                                    />
                                </div>
                                <GrowthChart series={projection.series} />
                                <YearTable series={projection.series} />
                            </CardContent>
                        </Card>

                        <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                            <FontAwesomeIcon
                                icon={faCircleInfo}
                                className="mt-0.5 size-3 shrink-0"
                            />
                            An illustration, not a promise. It assumes the same
                            return every year, compounded monthly, with each
                            installment at the start of the month, before tax
                            and exit load. Real returns go up and down.
                        </p>
                    </div>
                </div>
            </div>

            {/* Phones: keep the answer in sight while adjusting the sliders. */}
            <div
                className={cn(
                    'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur transition-transform duration-200 lg:hidden',
                    heroVisible ? 'translate-y-full' : 'translate-y-0',
                )}
                aria-hidden={heroVisible}
            >
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                        {mode === 'amount'
                            ? `Value in ${years} yrs`
                            : 'Monthly SIP needed'}
                    </span>
                    <span className="font-display text-xl font-semibold tabular-nums">
                        {formatRupees(
                            mode === 'amount' ? projection.value : monthly,
                        )}
                    </span>
                </div>
            </div>
        </>
    );
}

function Stat({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">{children}</dd>
        </div>
    );
}

function Legend({
    color,
    label,
    dashed = false,
}: {
    color: string;
    label: string;
    dashed?: boolean;
}) {
    return (
        <span className="flex items-center gap-2 text-muted-foreground">
            <svg width="16" height="8" aria-hidden="true">
                <line
                    x1="0"
                    y1="4"
                    x2="16"
                    y2="4"
                    strokeWidth="2"
                    stroke={color}
                    strokeDasharray={dashed ? '4 3' : undefined}
                />
            </svg>
            {label}
        </span>
    );
}
