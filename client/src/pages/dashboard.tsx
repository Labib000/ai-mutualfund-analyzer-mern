import {
    faArrowRight,
    faCalendar,
    faPlus,
    faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import AllocationBar from '@/components/dashboard/allocation-bar';
import CategoryList from '@/components/dashboard/category-list';
import PortfolioSummary from '@/components/dashboard/portfolio-summary';
import ValueChart from '@/components/dashboard/value-chart';
import { Head } from '@/components/head';
import { PageError, PageLoading } from '@/components/page-state';
import HoldingsTable from '@/components/portfolio/holdings-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useDashboard } from '@/hooks/use-portfolio';
import { useUser } from '@/hooks/use-user';
import { formatDate } from '@/lib/format';

/** Port of pages/dashboard; the insights, AI summary and change cards arrive in Phases 3 and 4. */
export default function Dashboard() {
    const [params, setParams] = useSearchParams();
    const { data, error, refetch } = useDashboard();

    // Arrived from the email verification link.
    useEffect(() => {
        if (params.get('verified') === '1') {
            toast.success('Your email address has been verified.');
            setParams({}, { replace: true });
        }
    }, [params, setParams]);

    if (error) return <PageError error={error} retry={() => void refetch()} />;
    if (!data) return <PageLoading />;

    const { fundCount, summary, history, allocation, topHoldings } = data;
    const showChart = history.length > 1;
    const showAllocation = allocation.classes.length > 0;

    return (
        <>
            <Head title="Dashboard" />

            {/* One opacity fade for the page; cheap enough for low-end phones. */}
            <div className="flex flex-1 animate-in flex-col gap-4 p-4 duration-300 fade-in sm:gap-6 md:p-6">
                <PageHeader
                    valuedOn={summary.valuedOn}
                    hasFunds={fundCount > 0}
                />

                {fundCount === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        <PortfolioSummary summary={summary} />

                        {(showChart || showAllocation) && (
                            <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
                                {showChart && (
                                    <Card
                                        className={
                                            showAllocation
                                                ? 'min-w-0 lg:col-span-2 2xl:col-span-3'
                                                : 'min-w-0 lg:col-span-3 2xl:col-span-5'
                                        }
                                    >
                                        <SectionHeader
                                            title="Value over time"
                                            description="Weekly value of your funds against the cost of the units you held."
                                        />
                                        <CardContent>
                                            <ValueChart history={history} />
                                        </CardContent>
                                    </Card>
                                )}

                                {showAllocation && (
                                    <Card
                                        className={
                                            showChart
                                                ? 'min-w-0 2xl:col-span-2'
                                                : 'min-w-0 lg:col-span-3 2xl:col-span-5'
                                        }
                                    >
                                        <SectionHeader
                                            title="Allocation"
                                            description="Share of current value by asset class and fund category."
                                        />
                                        <CardContent className="space-y-6">
                                            <AllocationBar
                                                classes={allocation.classes}
                                            />
                                            <Separator />
                                            <CategoryList
                                                categories={
                                                    allocation.categories
                                                }
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        )}

                        <Card className="gap-4 pb-0 lg:pb-6">
                            <CardHeader className="flex flex-row items-center justify-between gap-3">
                                <CardTitle>
                                    {fundCount > topHoldings.length
                                        ? `Top ${topHoldings.length} holdings`
                                        : 'Holdings'}
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    asChild
                                    className="-mr-2"
                                >
                                    <Link to="/holdings">
                                        View all {fundCount}
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </Link>
                                </Button>
                            </CardHeader>
                            <CardContent className="px-0 lg:px-6">
                                <HoldingsTable
                                    holdings={topHoldings}
                                    compact
                                    embedded
                                />
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </>
    );
}

function greeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) return 'Good morning';

    return hour < 17 ? 'Good afternoon' : 'Good evening';
}

function PageHeader({
    valuedOn,
    hasFunds,
}: {
    valuedOn: string | null;
    hasFunds: boolean;
}) {
    const user = useUser();
    const firstName = user.name.split(' ')[0];

    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col items-start gap-2">
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                    {greeting()}, {firstName}
                </h1>
                {valuedOn ? (
                    <Badge
                        variant="secondary"
                        className="gap-1.5 font-normal text-muted-foreground"
                    >
                        <FontAwesomeIcon icon={faCalendar} aria-hidden="true" />
                        Valued at NAVs up to {formatDate(valuedOn)}
                    </Badge>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Your mutual fund portfolio at a glance.
                    </p>
                )}
            </div>
            {hasFunds && (
                <Button asChild className="shrink-0" aria-label="Add fund">
                    <Link to="/holdings/create">
                        <FontAwesomeIcon icon={faPlus} />
                        <span className="hidden sm:inline">Add fund</span>
                    </Link>
                </Button>
            )}
        </div>
    );
}

function SectionHeader({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
        </CardHeader>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-5 rounded-lg border border-dashed bg-card px-4 py-12 text-center sm:px-6 sm:py-24">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FontAwesomeIcon
                    icon={faWallet}
                    className="size-5"
                    aria-hidden="true"
                />
            </span>
            <div className="max-w-sm space-y-2">
                <p className="text-lg font-semibold">No funds yet</p>
                <p className="text-sm text-muted-foreground">
                    Add a fund and record your purchases or SIPs. Hisaab will
                    track its value, returns and XIRR from official AMFI NAVs.
                </p>
            </div>
            <Button asChild>
                <Link to="/holdings/create">
                    <FontAwesomeIcon icon={faPlus} /> Add your first fund
                </Link>
            </Button>
        </div>
    );
}
