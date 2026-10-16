import { Eye, MessageCircle, Phone, Percent } from "lucide-react";
import { contactRate, type Totals } from "@/lib/analytics/admin-stats";
import { TrendChart } from "./trend-chart";

// Admin only (admin listing page): one business's views and taps for 7, 30 and 90 days, and its
// 90-day trend. Shown whatever the "Show stats to business owners" switch says.

const nf = (n: number) => n.toLocaleString("en-NG");
const dayFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));
const rate = (t: Totals) => {
  const r = contactRate(t);
  return r === null ? "–" : `${r.toFixed(1)}%`;
};

export function AdminBusinessStats({
  businessId,
  businessName,
  stats,
}: {
  businessId: string;
  businessName: string;
  stats: {
    periods: Record<7 | 30 | 90, Totals>;
    daily: { day: string; views: number; contacts: number }[];
  };
}) {
  const p = stats.periods;
  const rows = [
    { icon: Eye, label: "Views", get: (t: Totals) => nf(t.views) },
    { icon: MessageCircle, label: "WhatsApp taps", get: (t: Totals) => nf(t.whatsapp) },
    { icon: Phone, label: "Call taps", get: (t: Totals) => nf(t.calls) },
    { icon: Percent, label: "Contact rate", get: rate },
  ];
  return (
    <div className="space-y-4">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Views and taps for {businessName}</caption>
          <thead className="text-left text-gray-700">
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 font-medium">
                <span className="sr-only">Measure</span>
              </th>
              {[7, 30, 90].map((d) => (
                <th key={d} scope="col" className="py-1.5 pl-3 text-right font-medium">
                  Last {d} days
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ icon: Icon, label, get }) => (
              <tr key={label}>
                <th scope="row" className="py-2 text-left font-normal text-gray-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon aria-hidden="true" className="size-4 text-brand-700" />
                    {label}
                  </span>
                </th>
                <td className="py-2 pl-3 text-right font-semibold text-gray-900 tabular-nums">
                  {get(p[7])}
                </td>
                <td className="py-2 pl-3 text-right font-semibold text-gray-900 tabular-nums">
                  {get(p[30])}
                </td>
                <td className="py-2 pl-3 text-right font-semibold text-gray-900 tabular-nums">
                  {get(p[90])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">
        Contact rate: WhatsApp, call and email taps per 100 views. Repeat views by the same visitor
        within 6 hours count once; the owner&apos;s and admins&apos; own visits aren&apos;t counted.
      </p>
      <TrendChart
        id={`admin-trend-${businessId}`}
        small
        title={`${businessName}: views and contacts per day, last 90 days`}
        labels={stats.daily.map((d) => shortDay(d.day))}
        series={[
          {
            label: "Views",
            values: stats.daily.map((d) => d.views),
            className: "stroke-brand-600",
            swatch: "bg-brand-600",
          },
          {
            label: "Contacts",
            values: stats.daily.map((d) => d.contacts),
            className: "stroke-accent-500",
            swatch: "bg-accent-500",
          },
        ]}
      />
    </div>
  );
}
