import "server-only";
import { randomBytes } from "node:crypto";
import type { ContactType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_NAME } from "@/lib/qr/rules";
import {
  classifyDevice,
  classifySource,
  dayDate,
  lagosDay,
  visitorCode,
  type PathType,
} from "./rules";

// Records anonymous analytics events (called by /api/track). See ./rules for what is stored.

let cachedSalt: { day: string; salt: string } | null = null;

/** The salt for a day: created on first use, shared by all servers; earlier days' salts are deleted. */
export async function saltFor(day: string) {
  if (cachedSalt?.day === day) return cachedSalt.salt;
  await prisma.$executeRaw`
    INSERT INTO analytics_salts (day, salt) VALUES (${day}::date, ${randomBytes(32).toString("hex")})
    ON CONFLICT (day) DO NOTHING`;
  const row = await prisma.analyticsSalt.findUnique({ where: { day: dayDate(day) } });
  if (!row) throw new Error("analytics salt missing");
  await prisma.analyticsSalt.deleteMany({ where: { day: { lt: dayDate(day) } } });
  cachedSalt = { day, salt: row.salt };
  return row.salt;
}

/** Forget the cached salt (tests only). */
export function resetSaltCache() {
  cachedSalt = null;
}

export type RequestInfo = { ip: string; userAgent: string; siteHost: string };

export function requestInfo(headers: Headers, siteHost: string): RequestInfo {
  return {
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip")?.trim() ||
      "unknown",
    userAgent: headers.get("user-agent") ?? "",
    siteHost,
  };
}

/** Today's visitor code and device for this request. */
async function visitorFor(req: RequestInfo, now = Date.now()) {
  const day = lagosDay(now);
  const salt = await saltFor(day);
  return {
    day,
    visitor: visitorCode(salt, req.ip, req.userAgent),
    device: classifyDevice(req.userAgent),
  };
}

/** Entry details for the first page of a visit: where it came from. */
export type Entry = { referrerHost: string | null; qrCampaign: string | null } | null;

async function sourceFor(req: RequestInfo, entry: Entry) {
  if (!entry) return { source: null, campaign: null };
  let campaign: string | null = null;
  if (entry.qrCampaign && CAMPAIGN_NAME.test(entry.qrCampaign)) {
    // Only campaigns created in /admin/qr-codes count as QR visits.
    const known = await prisma.qrCampaign.count({ where: { name: entry.qrCampaign } });
    if (known) campaign = entry.qrCampaign;
  }
  const source = classifySource({
    referrerHost: entry.referrerHost,
    siteHost: req.siteHost,
    userAgent: req.userAgent,
    qrCampaign: campaign,
  });
  return { source, campaign };
}

export async function recordPageView(req: RequestInfo, pathType: PathType, entry: Entry) {
  const [v, s] = await Promise.all([visitorFor(req), sourceFor(req, entry)]);
  await prisma.analyticsEvent.create({
    data: {
      day: dayDate(v.day),
      kind: "PAGE_VIEW",
      visitor: v.visitor,
      device: v.device,
      pathType,
      ...s,
    },
  });
}

/**
 * A business page view, recorded only for APPROVED businesses the viewer doesn't own.
 * `repeat` views (same browser within 6 hours) count as page views but not as business views.
 */
export async function recordBusinessView(
  req: RequestInfo,
  input: { businessId: string; viewerId: string | null; repeat: boolean; entry: Entry },
) {
  const [v, s] = await Promise.all([visitorFor(req), sourceFor(req, input.entry)]);
  const inserted = await prisma.$executeRaw`
    INSERT INTO analytics_events (day, kind, visitor, device, path_type, source, campaign, business_id, repeat)
    SELECT ${v.day}::date, 'PAGE_VIEW', ${v.visitor}, ${v.device}, 'business', ${s.source}, ${s.campaign},
      b.id, ${input.repeat}
    FROM businesses b
    WHERE b.id = ${input.businessId}::uuid AND b.status = 'APPROVED'
      AND (${input.viewerId}::uuid IS NULL OR b.owner_id <> ${input.viewerId}::uuid)`;
  return inserted === 1;
}

/** A WhatsApp/call/email tap (the caller has already checked the business and the owner). */
export async function recordContact(req: RequestInfo, businessId: string, type: ContactType) {
  const v = await visitorFor(req);
  await prisma.analyticsEvent.create({
    data: {
      day: dayDate(v.day),
      kind: "CONTACT",
      visitor: v.visitor,
      device: v.device,
      businessId,
      contactType: type,
    },
  });
}

/** A search: cleaned text and filters only, never linked to an account. */
export async function recordSearch(
  req: RequestInfo,
  input: { query: string; category: string | null; state: string | null; resultCount: number },
) {
  const v = await visitorFor(req);
  await prisma.analyticsEvent.create({
    data: {
      day: dayDate(v.day),
      kind: "SEARCH",
      visitor: v.visitor,
      device: v.device,
      query: input.query,
      category: input.category,
      state: input.state,
      resultCount: input.resultCount,
    },
  });
}
