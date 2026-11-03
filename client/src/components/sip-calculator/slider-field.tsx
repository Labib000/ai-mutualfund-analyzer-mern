import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A labelled value with an editable box and a slider that stay in sync.
 * `scale="log"` spreads a wide range (e.g. ₹1 lakh to ₹50 crore) evenly along
 * the slider. Typed values are clamped to [min, max] when the box loses focus.
 */
export default function SliderField({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    scale = 'linear',
    prefix,
    suffix,
    hint,
    format = (v) => v.toLocaleString('en-IN'),
    marks,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    scale?: 'linear' | 'log';
    prefix?: string;
    suffix?: string;
    hint?: ReactNode;
    format?: (value: number) => string;
    /** Labels under the slider's ends. */
    marks?: [string, string];
}) {
    const id = useId();
    const [text, setText] = useState(format(value));
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (!editing) setText(format(value));
    }, [value, editing, format]);

    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    const snap = (v: number) => Math.round(v / step) * step;

    // The slider runs 0–1000 in log mode, so its steps are even on a log scale.
    const toSlider = (v: number) =>
        scale === 'log' ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v;
    const fromSlider = (s: number) =>
        scale === 'log' ? snap(min * (max / min) ** (s / 1000)) : s;

    const sliderValue = toSlider(value);
    const fill =
        scale === 'log'
            ? sliderValue / 10
            : ((value - min) / (max - min)) * 100;

    const commit = () => {
        const parsed = Number(text.replace(/[^\d.]/g, ''));
        onChange(
            Number.isFinite(parsed) && text.trim() !== ''
                ? clamp(snap(parsed))
                : value,
        );
        setEditing(false);
    };

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <div className="flex h-9 min-w-0 items-center rounded-lg border bg-background px-2.5 text-sm font-semibold tabular-nums shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    {prefix && (
                        <span className="mr-1 text-muted-foreground">
                            {prefix}
                        </span>
                    )}
                    <input
                        id={id}
                        inputMode="decimal"
                        value={text}
                        onFocus={(e) => {
                            setEditing(true);
                            setText(String(value));
                            e.currentTarget.select();
                        }}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        className="min-w-0 bg-transparent text-right outline-none"
                        style={{ width: `${Math.max(3, text.length + 1)}ch` }}
                    />
                    {suffix && (
                        <span className="ml-1 text-muted-foreground">
                            {suffix}
                        </span>
                    )}
                </div>
            </div>
            <input
                type="range"
                aria-label={label}
                aria-valuetext={`${prefix ?? ''}${format(value)}${suffix ? ` ${suffix}` : ''}`}
                min={scale === 'log' ? 0 : min}
                max={scale === 'log' ? 1000 : max}
                step={scale === 'log' ? 1 : step}
                value={sliderValue}
                onChange={(e) =>
                    onChange(clamp(fromSlider(Number(e.target.value))))
                }
                className="range-slider"
                style={{
                    ['--fill' as string]: `${Math.min(100, Math.max(0, fill))}%`,
                }}
            />
            {(marks || hint) && (
                <div
                    className={cn(
                        'flex justify-between gap-2 text-xs text-muted-foreground',
                    )}
                >
                    {marks ? (
                        <>
                            <span>{marks[0]}</span>
                            {hint && (
                                <span className="text-center">{hint}</span>
                            )}
                            <span>{marks[1]}</span>
                        </>
                    ) : (
                        hint
                    )}
                </div>
            )}
        </div>
    );
}
