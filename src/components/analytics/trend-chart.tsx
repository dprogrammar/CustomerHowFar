import { cn } from "@/lib/utils";

// A small line chart drawn as plain SVG on the server: no chart library and no JavaScript in the
// browser. The same numbers are available as a table for screen readers and anyone who wants them.

export type TrendSeries = { label: string; values: number[]; className: string; swatch: string };

const W = 600;
const H = 160;
const PAD = 6;

function points(values: number[], max: number) {
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? PAD + i * step : W / 2;
      const y = H - PAD - (max ? (v / max) * (H - PAD * 2) : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendChart({
  id,
  title,
  labels,
  series,
  small,
  className,
}: {
  id: string;
  title: string;
  /** One label per point (dates or hours). */
  labels: string[];
  series: TrendSeries[];
  small?: boolean;
  className?: string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const summary = series
    .map(
      (s) => `${s.label}: ${s.values.reduce((a, b) => a + b, 0).toLocaleString("en-NG")} in total`,
    )
    .join(", ");
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-0.5 w-4 rounded", s.swatch)} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto tabular-nums">Highest: {max.toLocaleString("en-NG")}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-title`}
        className={cn("mt-2 w-full rounded-lg bg-muted/60", small ? "h-20" : "h-40 sm:h-48")}
      >
        <title id={`${id}-title`}>{`${title}. ${summary}.`}</title>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            className="stroke-gray-200"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={points(s.values, max)}
            fill="none"
            className={s.className}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {labels.length > 1 && (
        <div className="mt-1 flex justify-between text-xs text-gray-600" aria-hidden="true">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-brand-700 underline underline-offset-2">
          Show as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-muted text-left text-gray-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {small ? "Day" : "Period"}
                </th>
                {series.map((s) => (
                  <th key={s.label} scope="col" className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {labels.map((label, i) => (
                <tr key={label}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-gray-800">
                    {label}
                  </th>
                  {series.map((s) => (
                    <td key={s.label} className="px-3 py-1.5 text-right text-gray-900 tabular-nums">
                      {(s.values[i] ?? 0).toLocaleString("en-NG")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
