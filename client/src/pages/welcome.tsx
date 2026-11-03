import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faArrowRight,
    faArrowTrendUp,
    faChartLine,
    faCircleCheck,
    faLandmark,
    faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import AppWordmark from '@/components/app-wordmark';
import AppearanceDropdown from '@/components/appearance-dropdown';
import { Head } from '@/components/head';
import { Reveal, Stagger } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/use-user';

const features: { icon: IconDefinition; title: string; text: string }[] = [
    {
        icon: faLandmark,
        title: 'Official AMFI NAVs',
        text: 'Prices come from the AMFI daily NAV file and update every night, so your values match your statements.',
    },
    {
        icon: faChartLine,
        title: 'Returns that add up',
        text: 'Invested, current value, gain and XIRR for every fund and your whole portfolio, worked out to the paisa.',
    },
    {
        icon: faWandMagicSparkles,
        title: 'Explained in plain words',
        text: 'Ask questions about your own portfolio and get clear explanations. Hisaab explains; it never gives advice.',
    },
];

export default function Welcome() {
    const user = useMe().data?.user;

    return (
        <>
            <Head title="Track your mutual funds" />

            <div className="flex min-h-svh flex-col bg-background text-foreground">
                <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
                    <Link to="/" aria-label="Hisaab home">
                        <AppWordmark className="h-8 sm:h-9" />
                    </Link>
                    <nav className="flex items-center gap-1 sm:gap-2">
                        <AppearanceDropdown />
                        {user ? (
                            <Button asChild>
                                <Link to="/dashboard">Open dashboard</Link>
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="ghost"
                                    asChild
                                    className="hidden sm:inline-flex"
                                >
                                    <Link to="/login">Log in</Link>
                                </Button>
                                <Button asChild>
                                    <Link to="/register">Get started</Link>
                                </Button>
                            </>
                        )}
                    </nav>
                </header>

                <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
                    <Stagger className="grid items-center gap-12 py-10 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
                        <div className="space-y-6 text-center lg:text-left">
                            <Reveal>
                                <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                                    <span className="size-1.5 rounded-full bg-primary" />
                                    Made for Indian mutual fund investors
                                </span>
                            </Reveal>
                            <Reveal>
                                <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                    Know exactly how your{' '}
                                    <span className="text-primary">
                                        mutual funds
                                    </span>{' '}
                                    are doing.
                                </h1>
                            </Reveal>
                            <Reveal>
                                <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
                                    Add your funds and SIPs. Hisaab fetches
                                    official AMFI NAVs, calculates your returns
                                    including XIRR, and explains your portfolio
                                    in plain language.
                                </p>
                            </Reveal>
                            <Reveal className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                                {user ? (
                                    <Button asChild size="lg">
                                        <Link to="/dashboard" className="group">
                                            Go to your dashboard
                                            <FontAwesomeIcon
                                                icon={faArrowRight}
                                                className="transition-transform group-hover:translate-x-0.5"
                                            />
                                        </Link>
                                    </Button>
                                ) : (
                                    <>
                                        <Button asChild size="lg">
                                            <Link
                                                to="/register"
                                                className="group"
                                            >
                                                Start tracking free
                                                <FontAwesomeIcon
                                                    icon={faArrowRight}
                                                    className="transition-transform group-hover:translate-x-0.5"
                                                />
                                            </Link>
                                        </Button>
                                        <Button
                                            asChild
                                            size="lg"
                                            variant="outline"
                                        >
                                            <Link to="/login">
                                                I have an account
                                            </Link>
                                        </Button>
                                    </>
                                )}
                            </Reveal>
                        </div>

                        <Reveal>
                            <PortfolioPreview />
                        </Reveal>
                    </Stagger>

                    <Stagger className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map((feature) => (
                            <Reveal key={feature.title}>
                                <motion.div
                                    whileHover={{ y: -2 }}
                                    transition={{
                                        type: 'spring',
                                        stiffness: 400,
                                        damping: 30,
                                    }}
                                    className="h-full space-y-3 rounded-lg border bg-card p-6 shadow-xs transition-shadow hover:shadow-md"
                                >
                                    <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                                        <FontAwesomeIcon
                                            icon={feature.icon}
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <h2 className="text-lg font-semibold">
                                        {feature.title}
                                    </h2>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {feature.text}
                                    </p>
                                </motion.div>
                            </Reveal>
                        ))}
                    </Stagger>
                </main>

                <footer className="border-t">
                    <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
                        <p>
                            Hisaab analyzes and explains. It never gives
                            investment advice.
                        </p>
                        <p>© {new Date().getFullYear()} Hisaab</p>
                    </div>
                </footer>
            </div>
        </>
    );
}

/**
 * A static illustration of the dashboard. The figures are sample values.
 */
function PortfolioPreview() {
    const bars = [38, 46, 42, 55, 51, 63, 60, 72, 69, 84];

    return (
        <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
            <div className="space-y-5 rounded-lg border bg-card p-6 shadow-lg">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                            Current value
                        </p>
                        <p className="font-display text-3xl font-semibold tracking-tight">
                            ₹4,82,315
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <FontAwesomeIcon icon={faArrowTrendUp} />
                        14.2% XIRR
                    </span>
                </div>

                <div className="flex h-28 items-end gap-1.5">
                    {bars.map((height, index) => (
                        <motion.div
                            key={index}
                            initial={{ height: 0 }}
                            animate={{ height: `${height}%` }}
                            transition={{
                                duration: 0.6,
                                delay: 0.4 + index * 0.05,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            className={
                                index === bars.length - 1
                                    ? 'flex-1 rounded-t-sm bg-primary'
                                    : 'flex-1 rounded-t-sm bg-primary/25'
                            }
                        />
                    ))}
                </div>

                <ul className="space-y-2.5 text-sm">
                    {[
                        ['Flexi Cap Fund', '+₹38,240'],
                        ['Liquid Fund', '+₹4,105'],
                    ].map(([name, gain]) => (
                        <li
                            key={name}
                            className="flex items-center justify-between rounded-md bg-muted px-3 py-2.5"
                        >
                            <span className="flex items-center gap-2">
                                <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className="text-primary"
                                />
                                {name}
                            </span>
                            <span className="font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
                                {gain}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
