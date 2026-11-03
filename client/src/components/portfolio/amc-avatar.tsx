import { useState } from 'react';

import { amcLogo } from '@/lib/amc-logos';
import { cn } from '@/lib/utils';

const COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

/** "PPFAS Mutual Fund" → "PP", "Aditya Birla Sun Life Mutual Fund" → "AB". */
export function amcInitials(amc: string): string {
    const words = amc
        .replace(/\s+mutual\s+fund$/i, '')
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function colorFor(amc: string): string {
    let hash = 0;
    for (const char of amc) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return COLORS[hash % COLORS.length]!;
}

/**
 * The fund house's logo on a white tile (logos are drawn for light
 * backgrounds), or a coloured monogram when there's no logo.
 */
export default function AmcAvatar({
    amc,
    className,
}: {
    amc: string;
    className?: string;
}) {
    const logo = amcLogo(amc);
    const [failed, setFailed] = useState(false);

    if (logo && !failed) {
        return (
            <span
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-black/5 dark:ring-white/10',
                    className,
                )}
            >
                <img
                    src={logo}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed(true)}
                    className="size-full object-contain"
                />
            </span>
        );
    }

    const color = colorFor(amc);

    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-wide',
                className,
            )}
            style={{
                color,
                backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)`,
            }}
        >
            {amcInitials(amc)}
        </span>
    );
}
