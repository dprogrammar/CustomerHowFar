import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/categories";
import { getPreferences, listDevices } from "@/lib/notifications/server";
import {
  PreferenceSwitch,
  PushDeviceToggle,
  RemoveDeviceButton,
} from "@/components/notifications/settings-controls";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

async function Settings() {
  const user = await requireUser("/account/notifications");
  const [prefs, devices] = await Promise.all([getPreferences(user.id), listDevices(user.id)]);
  const isAdmin = user.role === "ADMIN";
  const categories = NOTIFICATION_CATEGORIES.filter((c) => !c.adminOnly || isAdmin);

  return (
    <>
      <section aria-labelledby="device-title">
        <h2 id="device-title" className="mb-2 text-lg font-semibold text-gray-900">
          This device
        </h2>
        <PushDeviceToggle />
      </section>

      <section aria-labelledby="choices-title" className="mt-8">
        <h2 id="choices-title" className="text-lg font-semibold text-gray-900">
          What you get
        </h2>
        <p className="mt-1 text-sm text-gray-700">
          Notifications always appear under the bell at the top of the page. Choose which ones also
          come by push and by email.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Push and email notifications by type</caption>
            <thead className="bg-muted text-left text-gray-700">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Type
                </th>
                <th scope="col" className="w-16 px-2 py-2.5 text-center font-medium">
                  Push
                </th>
                <th scope="col" className="w-16 px-2 py-2.5 text-center font-medium">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map((c) => {
                const p = prefs(c.key);
                return (
                  <tr key={c.key}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="block font-medium text-gray-900">{c.label}</span>
                      <span className="block text-gray-600">{c.description}</span>
                      {c.key === "ADMIN" && (
                        <span className="mt-1 block text-xs text-gray-600">
                          Admin emails go to the team inbox, not to you.
                        </span>
                      )}
                    </th>
                    <td className="px-2 py-3 text-center">
                      <PreferenceSwitch
                        category={c.key}
                        channel="push"
                        label={`${c.label} by push`}
                        initial={p.push}
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      {c.key === "ADMIN" ? (
                        <span className="text-xs text-gray-600">Team inbox</span>
                      ) : (
                        <PreferenceSwitch
                          category={c.key}
                          channel="email"
                          label={`${c.label} by email`}
                          initial={p.email}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Important account emails (such as password resets or a suspended account) are always sent.
        </p>
      </section>

      <section aria-labelledby="devices-title" className="mt-8">
        <h2 id="devices-title" className="text-lg font-semibold text-gray-900">
          Devices with push notifications
        </h2>
        {devices.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-white">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Smartphone aria-hidden="true" className="size-4 text-gray-600" />
                  <span>
                    <span className="block font-medium text-gray-900">{d.label}</span>
                    <span className="block text-gray-600">Added {dateFmt.format(d.createdAt)}</span>
                  </span>
                </span>
                <RemoveDeviceButton id={d.id} label={d.label} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function NotificationSettingsPage() {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container className="max-w-3xl">
        <Link
          href="/account"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          My account
        </Link>
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Notification settings
        </h1>
        <Suspense
          fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
        >
          <Settings />
        </Suspense>
      </Container>
    </div>
  );
}
