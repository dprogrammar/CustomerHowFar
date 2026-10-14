"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Download, FileImage, QrCode } from "lucide-react";
import { saveQrCampaignAction } from "@/lib/admin/qr-actions";
import { downloadBlob, qrPng, qrSvg } from "@/lib/qr/render";
import {
  campaignUrl,
  CAMPAIGN_NAME,
  DEFAULT_CAMPAIGN,
  QR_CAPTION,
  toCampaignName,
} from "@/lib/qr/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export type QrCampaignRow = {
  id: string;
  name: string;
  visits: number;
  signups: number;
  listings: number;
  lastVisit: string | null;
  created: string;
};

/** Create, preview and download QR codes, and download saved ones again. */
export function QrStudio({ siteUrl, campaigns }: { siteUrl: string; campaigns: QrCampaignRow[] }) {
  const [raw, setRaw] = useState(DEFAULT_CAMPAIGN);
  const [caption, setCaption] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { name: useId(), hint: useId(), caption: useId() };

  const name = toCampaignName(raw);
  const valid = CAMPAIGN_NAME.test(name);
  const url = valid ? campaignUrl(siteUrl, name) : "";
  const captionText = caption ? QR_CAPTION : null;
  const preview = useMemo(
    () =>
      valid
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url, captionText))}`
        : null,
    [valid, url, captionText],
  );

  const download = (format: "png" | "svg", campaign = name) =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const saved = await saveQrCampaignAction({ name: campaign });
      if (!saved.ok) return setError(saved.error);
      const target = campaignUrl(siteUrl, campaign);
      const file = `customerhowfar-qr-${campaign}${caption ? "-caption" : ""}`;
      if (format === "svg") {
        downloadBlob(
          new Blob([qrSvg(target, captionText)], { type: "image/svg+xml" }),
          `${file}.svg`,
        );
      } else {
        downloadBlob(await qrPng(target, captionText), `${file}.png`);
      }
      setMessage(`Downloaded the "${campaign}" QR code (${format.toUpperCase()}).`);
    });

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="qr-create-title"
        className="grid gap-6 rounded-xl border border-border bg-white p-4 shadow-card sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="space-y-5">
          <h2 id="qr-create-title" className="text-lg font-semibold text-gray-900">
            Create a QR code
          </h2>
          <div>
            <Label htmlFor={ids.name}>Campaign name</Label>
            <Input
              id={ids.name}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              maxLength={40}
              aria-describedby={ids.hint}
              aria-invalid={!valid || undefined}
            />
            <p id={ids.hint} className="mt-1.5 text-sm text-gray-700">
              {valid ? (
                <>
                  Opens <span className="font-mono text-xs break-all">{url}</span>
                </>
              ) : (
                <span className="text-red-700">
                  Use letters and numbers, e.g. &ldquo;flyer&rdquo; or &ldquo;ikeja-market&rdquo;.
                </span>
              )}
            </p>
          </div>
          <label htmlFor={ids.caption} className="flex items-start gap-3 text-sm text-gray-800">
            <input
              id={ids.caption}
              type="checkbox"
              checked={caption}
              onChange={(e) => setCaption(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-brand-600"
            />
            <span>Add the caption &ldquo;{QR_CAPTION}&rdquo; under the code</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!valid || pending} onClick={() => download("png")}>
              <Download aria-hidden="true" />
              Download PNG (print quality)
            </Button>
            <Button variant="outline" disabled={!valid || pending} onClick={() => download("svg")}>
              <FileImage aria-hidden="true" />
              Download SVG
            </Button>
          </div>
          <p className="text-sm text-gray-700">
            Codes are made here, point straight to our site and never expire. The PNG is 2400px
            wide; the SVG prints sharp at any size.
          </p>
          {error && <FormAlert status="error">{error}</FormAlert>}
          {message && <FormAlert status="success">{message}</FormAlert>}
        </div>
        <figure className="mx-auto w-full max-w-72">
          <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-white">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: SVG
              <img
                src={preview}
                alt={`QR code preview for ${url}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <QrCode aria-hidden="true" className="m-auto mt-[40%] size-12 text-gray-400" />
            )}
          </div>
          <figcaption className="mt-2 text-center text-xs text-gray-600">Live preview</figcaption>
        </figure>
      </section>

      <section aria-labelledby="qr-list-title">
        <h2 id="qr-list-title" className="mb-1 text-lg font-semibold text-gray-900">
          Your QR codes
        </h2>
        <p className="mb-3 text-sm text-gray-700">
          Scans, and the sign-ups and new listings that followed within 30 days. Counts only: no
          personal data.
        </p>
        {campaigns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-white p-4 text-sm text-gray-700">
            No QR codes yet. Download one above and it will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs break-all text-gray-600">
                      {campaignUrl(siteUrl, c.name)}
                    </p>
                    <p className="mt-1 text-sm text-gray-800">
                      <strong>{c.visits}</strong> scan{c.visits === 1 ? "" : "s"} ·{" "}
                      <strong>{c.signups}</strong> sign-up{c.signups === 1 ? "" : "s"} ·{" "}
                      <strong>{c.listings}</strong> new listing{c.listings === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-gray-600">
                      Created {c.created}
                      {c.lastVisit ? ` · last scan ${c.lastVisit}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => download("png", c.name)}
                    >
                      <Download aria-hidden="true" />
                      PNG<span className="sr-only"> for {c.name}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => download("svg", c.name)}
                    >
                      <FileImage aria-hidden="true" />
                      SVG<span className="sr-only"> for {c.name}</span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
