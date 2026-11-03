import type { ReactNode } from 'react';

export default function StatTile({
    label,
    children,
    note,
}: {
    label: string;
    children: ReactNode;
    note?: ReactNode;
}) {
    return (
        <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
                {children}
            </div>
            {note && (
                <div className="mt-1 text-xs text-muted-foreground">{note}</div>
            )}
        </div>
    );
}
