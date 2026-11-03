import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { Head } from '@/components/head';

/** Placeholder for pages that arrive in a later phase. */
export default function ComingSoon({
    title,
    icon,
    description,
}: {
    title: string;
    icon: IconDefinition;
    description: string;
}) {
    return (
        <>
            <Head title={title} />
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <FontAwesomeIcon icon={icon} className="size-5" />
                    </span>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>
        </>
    );
}
