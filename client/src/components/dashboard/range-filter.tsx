import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type RangeKey = '3M' | '6M' | '1Y' | '3Y' | 'ALL';

export const RANGE_DAYS: Record<Exclude<RangeKey, 'ALL'>, number> = {
    '3M': 91,
    '6M': 182,
    '1Y': 365,
    '3Y': 1095,
};

/**
 * Preset time ranges. Ranges at least as long as the data are hidden, since they'd equal "All".
 */
export default function RangeFilter({
    value,
    onChange,
    spanDays,
}: {
    value: RangeKey;
    onChange: (range: RangeKey) => void;
    spanDays: number;
}) {
    const options = (
        Object.keys(RANGE_DAYS) as Exclude<RangeKey, 'ALL'>[]
    ).filter((key) => RANGE_DAYS[key] < spanDays);

    return (
        <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={value}
            onValueChange={(next) => next && onChange(next as RangeKey)}
            aria-label="Time range"
            className="w-full sm:w-auto"
        >
            {options.map((key) => (
                <ToggleGroupItem
                    key={key}
                    value={key}
                    className="flex-1 px-3 sm:flex-none"
                >
                    {key}
                </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="ALL" className="flex-1 px-3 sm:flex-none">
                All
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
