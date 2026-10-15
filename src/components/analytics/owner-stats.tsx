import { Eye, MessageCircle, Phone, TrendingUp } from "lucide-react";
import type { OwnerBusinessStats } from "@/lib/analytics/queries";
import { ownerStatsMessage } from "@/lib/analytics/messages";
import { TrendChart } from "./trend-chart";

const nf = (n: number) => n.toLocaleString("en-NG");
const dayFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

/** A business's views and WhatsApp/call taps, shown only to its owner on /dashboard. */
export function OwnerStats({
  businessId,
  businessName,
  stats,
}: {
  businessId: string;
  businessName: string;
  stats: OwnerBusinessStats | undefined;
}) {
  const s = stats ?? {
    views7: 0,
    contacts7: 0,
    whatsapp7: 0,
    calls7: 0,
    views30: 0,
    contacts30: 0,
    whatsapp30: 0,
    calls30: 0,
    daily: [],
  };
  const rows = [
    { icon: Eye, label: "Views", week: s.views7, month: s.views30 },
    { icon: MessageCircle, label: "WhatsApp taps", week: s.whatsapp7, month: s.whatsapp30 },
    { icon: Phone, label: "Call taps", week: s.calls7, month: s.calls30 },
  ];
  const titleId = `stats-${businessId}`;
  return (
    <section
      aria-labelledby={titleId}
      className="mt-4 rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-100 sm:p-4"
    >
      <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <TrendingUp aria-hidden="true" className="size-4 text-brand-700" />
        Your stats<span className="sr-only"> for {businessName}</span>
      </h3>
      <p className="mt-1 text-sm text-brand-900">{ownerStatsMessage(s.views7, s.contacts7)}</p>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Views and taps for {businessName}</caption>
        <thead className="text-left text-gray-700">
          <tr>
            <th scope="col" className="pb-1 font-medium">
              <span className="sr-only">Type</span>
            </th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">
              Last 7 days
            </th>
            <th scope="col" className="pb-1 pl-2 text-right font-medium">
              Last 30 days
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ icon: Icon, label, week, month }) => (
            <tr key={label}>
              <th scope="row" className="py-1 text-left font-normal text-gray-800">
                <span className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="size-4 text-brand-700" />
                  {label}
                </span>
              </th>
              <td className="py-1 pl-2 text-right font-semibold text-gray-900 tabular-nums">
                {nf(week)}
              </td>
              <td className="py-1 pl-2 text-right font-semibold text-gray-900 tabular-nums">
                {nf(month)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.daily.length > 0 && (
        <TrendChart
          id={`trend-${businessId}`}
          small
          className="mt-3"
          title={`${businessName}: views and contacts per day, last 30 days`}
          labels={s.daily.map((d) => shortDay(d.day))}
          series={[
            {
              label: "Views",
              values: s.daily.map((d) => d.views),
              className: "stroke-brand-600",
              swatch: "bg-brand-600",
            },
            {
              label: "Contacts",
              values: s.daily.map((d) => d.contacts),
              className: "stroke-accent-500",
              swatch: "bg-accent-500",
            },
          ]}
        />
      )}
      <p className="mt-2 text-xs text-gray-600">Only you can see these numbers.</p>
    </section>
  );
}
