import { formatRupees } from '@/lib/format';
import type { YearPoint } from '@/lib/sip-calculator';

/** Every year of the plan, newest last, in a scrolling box. */
export default function YearTable({ series }: { series: YearPoint[] }) {
    return (
        <details className="group text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Year-by-year breakdown
            </summary>
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border">
                <table className="w-full">
                    <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">Year</th>
                            <th className="px-3 py-2 text-right font-medium">
                                Monthly
                            </th>
                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                                Invested
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Value
                            </th>
                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                                Returns
                            </th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {series.map((p) => (
                            <tr key={p.year} className="border-t">
                                <td className="px-3 py-2">{p.year}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {formatRupees(p.monthly)}
                                </td>
                                <td className="hidden px-3 py-2 text-right whitespace-nowrap sm:table-cell">
                                    {formatRupees(p.invested)}
                                </td>
                                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                                    {formatRupees(p.value)}
                                </td>
                                <td className="hidden px-3 py-2 text-right whitespace-nowrap text-emerald-700 sm:table-cell dark:text-emerald-400">
                                    {formatRupees(p.value - p.invested)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}
