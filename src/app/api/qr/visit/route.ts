import type { NextRequest } from "next/server";
import { z } from "zod";
import { isProbablyBot } from "@/lib/bots";
import {
  QR_COOKIE,
  QR_COOKIE_DAYS,
  QR_VISIT_COOKIE,
  QR_VISIT_MINUTES,
  recordQrVisit,
} from "@/lib/qr/campaigns";
import { CAMPAIGN_NAME } from "@/lib/qr/rules";
import { ipKey, rateLimit } from "@/lib/rate-limit";

// A visit to /start from one of our QR codes (sent by the page after it has loaded, so it never
// slows it down). Counts the scan for the campaign and remembers the campaign name in a
// first-party cookie, so a later sign-up or new listing can be credited to it. No personal data.

const bodySchema = z.object({ campaign: z.string().regex(CAMPAIGN_NAME) });

export async function POST(request: NextRequest) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const done = () => new Response(null, { status: 204, headers });
  // Same-site only: other websites can't inflate counts.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done();
  if (isProbablyBot(request.headers.get("user-agent"))) return done();

  let campaign: string;
  try {
    const parsed = bodySchema.safeParse(JSON.parse(await request.text()));
    if (!parsed.success) return done();
    campaign = parsed.data.campaign;
  } catch {
    return done();
  }

  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  const repeat = request.cookies.get(QR_VISIT_COOKIE)?.value === campaign;
  if (!repeat && (await rateLimit("qr-visit", ipKey(request.headers))).ok) {
    if (!(await recordQrVisit(campaign))) return done(); // Unknown campaign: nothing to remember.
  }
  headers.append(
    "Set-Cookie",
    `${QR_COOKIE}=${campaign}; Max-Age=${QR_COOKIE_DAYS * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
  headers.append(
    "Set-Cookie",
    `${QR_VISIT_COOKIE}=${campaign}; Max-Age=${QR_VISIT_MINUTES * 60}; Path=/api/qr; HttpOnly; SameSite=Strict${secure}`,
  );
  return done();
}
