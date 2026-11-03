import { faCheck, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    type HoldingCreatedResponse,
    type SchemeSearchResult,
    assetClassFromCategory,
    assetClassLabel,
} from '@hisaab/shared';
import { Link } from 'react-router';

import { ASSET_CLASS_COLORS } from '@/components/dashboard/asset-class-colors';
import { Form } from '@/components/form';
import InputError from '@/components/input-error';
import AmcAvatar from '@/components/portfolio/amc-avatar';
import Highlight from '@/components/portfolio/highlight';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatNav } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One search result: fund house, name with the search words marked, NAV and an Add button. */
export default function SchemeResultCard({
    scheme,
    words,
    onAdded,
}: {
    scheme: SchemeSearchResult;
    words: string[];
    onAdded: (created: HoldingCreatedResponse) => void | Promise<void>;
}) {
    const assetClass = assetClassFromCategory(scheme.category);
    const category = scheme.category.includes(' - ')
        ? scheme.category.slice(scheme.category.indexOf(' - ') + 3)
        : scheme.category;

    return (
        <div
            className={cn(
                'group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors sm:flex-row sm:items-center',
                scheme.isHeld
                    ? 'border-primary/30 bg-primary/[0.03]'
                    : 'hover:border-primary/40 hover:shadow-sm',
            )}
        >
            <div className="flex min-w-0 flex-1 gap-3">
                <AmcAvatar amc={scheme.amc} />
                <div className="min-w-0 space-y-1.5">
                    <p className="leading-snug font-medium">
                        <Highlight text={scheme.name} words={words} />
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate">{scheme.amc}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5">
                            <span
                                className="size-2 rounded-full"
                                style={{
                                    backgroundColor:
                                        ASSET_CLASS_COLORS[assetClass],
                                }}
                                title={assetClassLabel(assetClass)}
                            />
                            {category}
                        </span>
                        {scheme.plan && (
                            <Badge
                                variant="outline"
                                className={cn(
                                    'h-5 px-1.5 text-[11px] capitalize',
                                    scheme.plan === 'direct' &&
                                        'border-emerald-600/30 text-emerald-700 dark:text-emerald-400',
                                )}
                            >
                                {scheme.plan}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
                {scheme.latestNav && scheme.latestNavDate && (
                    <div className="text-left sm:text-right">
                        <p className="font-semibold tabular-nums">
                            {formatNav(scheme.latestNav)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            NAV on {formatDate(scheme.latestNavDate)}
                        </p>
                    </div>
                )}

                {scheme.holdingId ? (
                    <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="w-28"
                    >
                        <Link to={`/holdings/${scheme.holdingId}`}>
                            <FontAwesomeIcon
                                icon={faCheck}
                                className="text-primary"
                            />{' '}
                            In portfolio
                        </Link>
                    </Button>
                ) : (
                    <Form<HoldingCreatedResponse>
                        action="/holdings"
                        onSuccess={onAdded}
                    >
                        {({ processing, errors }) => (
                            <div className="flex flex-col items-end gap-1">
                                <input
                                    type="hidden"
                                    name="scheme_id"
                                    value={scheme.id}
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="w-28"
                                    disabled={processing}
                                >
                                    {processing ? (
                                        <Spinner />
                                    ) : (
                                        <FontAwesomeIcon icon={faPlus} />
                                    )}
                                    Add
                                </Button>
                                <InputError
                                    message={errors.scheme_id}
                                    className="text-xs"
                                />
                            </div>
                        )}
                    </Form>
                )}
            </div>
        </div>
    );
}
