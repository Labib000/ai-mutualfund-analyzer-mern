import { type Appearance, useAppearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';

const THEMES: { value: Appearance; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];

/** A tiny app window, in the theme's real colours whatever is active now. */
function Window({ dark, className }: { dark: boolean; className?: string }) {
    return (
        <div
            className={cn(
                'flex h-full gap-1.5 p-2',
                dark ? 'bg-[#0b0f0e]' : 'bg-[#f7f8f8]',
                className,
            )}
        >
            <div
                className={cn(
                    'w-1/4 rounded-sm',
                    dark ? 'bg-[#121817]' : 'bg-white',
                )}
            />
            <div className="flex-1 space-y-1.5">
                <div
                    className={cn(
                        'h-2 w-3/5 rounded-full',
                        dark ? 'bg-[#e8eeec]' : 'bg-[#0f1a18]',
                    )}
                />
                <div
                    className={cn(
                        'space-y-1 rounded-sm p-1.5',
                        dark ? 'bg-[#121817]' : 'bg-white',
                    )}
                >
                    <div className="h-1.5 w-2/3 rounded-full bg-[#0e9384]" />
                    <div
                        className={cn(
                            'h-1.5 rounded-full',
                            dark ? 'bg-white/15' : 'bg-black/10',
                        )}
                    />
                </div>
            </div>
        </div>
    );
}

export default function ThemePicker() {
    const { appearance, updateAppearance } = useAppearance();

    return (
        <fieldset className="grid grid-cols-1 gap-3 @md:grid-cols-3 @md:gap-4">
            <legend className="sr-only">Theme</legend>
            {THEMES.map(({ value, label }) => (
                <label
                    key={value}
                    className="group cursor-pointer rounded-lg border p-2 transition-colors hover:border-muted-foreground/40 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                    <input
                        type="radio"
                        name="theme"
                        value={value}
                        checked={appearance === value}
                        onChange={() => updateAppearance(value)}
                        className="sr-only"
                    />
                    <div
                        aria-hidden="true"
                        className="flex h-24 overflow-hidden rounded-md border"
                    >
                        {value === 'system' ? (
                            <>
                                <Window dark={false} className="w-1/2 flex-1" />
                                <Window dark className="w-1/2 flex-1" />
                            </>
                        ) : (
                            <Window
                                dark={value === 'dark'}
                                className="w-full"
                            />
                        )}
                    </div>
                    <span className="mt-2 flex items-center justify-between px-1 pb-0.5 text-sm font-medium">
                        {label}
                        <span className="size-2 rounded-full bg-primary opacity-0 transition-opacity group-has-[:checked]:opacity-100" />
                    </span>
                </label>
            ))}
        </fieldset>
    );
}
