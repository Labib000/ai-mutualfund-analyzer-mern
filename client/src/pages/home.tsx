import { type HealthResponse, healthResponseSchema } from '@hisaab/shared';
import { useQuery } from '@tanstack/react-query';

import AppWordmark from '@/components/app-wordmark';
import AppearanceDropdown from '@/components/appearance-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';

async function fetchHealth(): Promise<HealthResponse> {
    try {
        return healthResponseSchema.parse(await api<unknown>('/health'));
    } catch (error) {
        // A 503 still carries a valid health body ("db: down").
        if (error instanceof ApiError && error.status === 503) {
            return healthResponseSchema.parse(error.body);
        }
        throw error;
    }
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
    return (
        <span
            className={cn(
                'inline-block size-2.5 rounded-full',
                ok === undefined && 'animate-pulse bg-muted-foreground',
                ok === true && 'bg-brand',
                ok === false && 'bg-destructive',
            )}
        />
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="flex items-center gap-2 font-medium">
                {children}
            </span>
        </div>
    );
}

export default function Home() {
    const health = useQuery({
        queryKey: ['health'],
        queryFn: fetchHealth,
        refetchInterval: 15_000,
    });

    const apiUp = health.isSuccess ? true : health.isError ? false : undefined;
    const dbUp = health.data
        ? health.data.db === 'up'
        : apiUp === false
          ? false
          : undefined;

    return (
        <div className="flex min-h-svh flex-col">
            <header className="flex items-center justify-between border-b px-6 py-3">
                <AppWordmark />
                <AppearanceDropdown />
            </header>

            <main className="flex flex-1 items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>System status</CardTitle>
                            <Badge variant="outline">Phase 0</Badge>
                        </div>
                        <CardDescription>
                            Hisaab on MongoDB, Express, React and Node.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="divide-y">
                        <Row label="API">
                            <StatusDot ok={apiUp} />
                            {apiUp === undefined
                                ? 'Checking…'
                                : apiUp
                                  ? 'Up'
                                  : 'Unreachable'}
                        </Row>
                        <Row label="Database">
                            <StatusDot ok={dbUp} />
                            {dbUp === undefined
                                ? 'Checking…'
                                : dbUp
                                  ? 'Up'
                                  : 'Down'}
                        </Row>
                        <Row label="Today (IST)">
                            {health.data?.today ?? '—'}
                        </Row>
                        <div className="pt-4">
                            <Button
                                className="w-full"
                                variant="outline"
                                onClick={() => void health.refetch()}
                                disabled={health.isFetching}
                            >
                                {health.isFetching
                                    ? 'Checking…'
                                    : 'Check again'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
