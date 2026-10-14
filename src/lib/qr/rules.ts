// QR code campaigns (shared by server and client). No server-only imports here.

/** Lowercase letters, digits and dashes, starting with a letter or digit (max 40). */
export const CAMPAIGN_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const DEFAULT_CAMPAIGN = "flyer";

/** Turns free text into a campaign name: "Ikeja Market Oct" -> "ikeja-market-oct". */
export function toCampaignName(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** Where a campaign's QR code points: our own /start page (no redirect service). */
export function campaignUrl(siteUrl: string, campaign: string) {
  return `${siteUrl.replace(/\/+$/, "")}/start?src=qr&campaign=${encodeURIComponent(campaign)}`;
}

/** Shown under the code when the caption is switched on. */
export const QR_CAPTION = "Scan to get started · www.customerhowfar.com.ng";
