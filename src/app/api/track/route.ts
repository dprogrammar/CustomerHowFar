import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isProbablyBot } from "@/lib/bots";
import { getActiveCategories, getStates } from "@/lib/data/catalog";
import { prisma } from "@/lib/prisma";
import { ipKey, rateLimit } from "@/lib/rate-limit";
import {
  recordBusinessView,
  recordContact,
  recordPageView,
  recordSearch,
  requestInfo,
  type Entry,
} from "@/lib/analytics/server";
import { classifyPath, cleanSearchText } from "@/lib/analytics/rules";

/** Sent with the first page of a visit only: the referring site's host name and the QR campaign. */
const entrySchema = z
  .object({
    ref: z.string().max(253).nullable(),
    qr: z.string().max(40).nullable(),
  })
  .optional();

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), businessId: z.uuid(), entry: entrySchema }),
  z.object({ type: z.enum(["WHATSAPP", "CALL", "EMAIL"]), businessId: z.uuid() }),
  z.object({ type: z.literal("page"), path: z.string().max(300), entry: entrySchema }),
  z.object({
    type: z.literal("search"),
    q: z.string().max(500),
    category: z.string().max(80).nullable(),
    state: z.string().max(80).nullable(),
    count: z.number().int().min(0).max(1_000_000),
  }),
]);

/** Repeat views within 6h (and repeat contact taps within 2 min) by the same browser count once. */
const DEDUPE_SECONDS = { view: 6 * 3600, contact: 120 } as const;

function noContent(cookie?: string) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 204, headers });
}

const toEntry = (e: z.infer<typeof entrySchema>): Entry =>
  e ? { referrerHost: e.ref, qrCampaign: e.qr } : null;

/** Analytics must never fail the beacon (or log anything personal). */
async function safely(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error("[track] analytics write failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * First-party, anonymous analytics beacon (sent with navigator.sendBeacon after the page has
 * loaded, so it never slows the page): page views, searches, business views and WhatsApp/call/
 * email taps. Ignores bots and admins; owners' visits to their own listings aren't counted.
 * Stores no IP addresses, user agents, URLs or account ids (see src/lib/analytics).
 */
export async function POST(request: NextRequest) {
  // Same-site only: other websites can't inflate counts.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return noContent();
  if (isProbablyBot(request.headers.get("user-agent"))) return noContent();

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(await request.text()));
  } catch {
    return noContent();
  }
  if (!parsed.success) return noContent();
  const body = parsed.data;

  let dedupeCookie: string | undefined;
  let repeat = false;
  if (body.type !== "page" && body.type !== "search") {
    const kind = body.type === "view" ? "view" : "contact";
    const cookieName = `chf_t_${kind === "view" ? "v" : body.type[0]!.toLowerCase()}_${body.businessId.slice(0, 8)}`;
    repeat = request.cookies.has(cookieName);
    // Repeat contact taps are ignored; repeat views still count as page views (not business views).
    if (repeat && kind === "contact") return noContent();
    if (!repeat) {
      dedupeCookie = `${cookieName}=1; Max-Age=${DEDUPE_SECONDS[kind]}; Path=/api/track; HttpOnly; SameSite=Strict${
        request.nextUrl.protocol === "https:" ? "; Secure" : ""
      }`;
    }
  }

  // Floods from one IP are dropped silently (analytics only).
  if (!(await rateLimit("track", ipKey(request.headers))).ok) return noContent();

  const viewer = await getCurrentUser().catch(() => null);
  if (viewer?.role === "ADMIN") return noContent();
  const req = requestInfo(request.headers, request.nextUrl.hostname);

  switch (body.type) {
    case "page": {
      const pathType = classifyPath(body.path);
      // Business pages are counted by their own "view" beacon (which knows the business).
      if (pathType && pathType !== "business")
        await safely(() => recordPageView(req, pathType, toEntry(body.entry)));
      return noContent();
    }
    case "search": {
      const [categories, states] = await Promise.all([getActiveCategories(), getStates()]);
      const category = categories.some((c) => c.slug === body.category) ? body.category : null;
      const state = states.some((s) => s.slug === body.state) ? body.state : null;
      const query = cleanSearchText(body.q);
      if (query || category || state)
        await safely(() => recordSearch(req, { query, category, state, resultCount: body.count }));
      return noContent();
    }
    case "view": {
      const businessId = body.businessId;
      const viewerId = viewer?.id ?? null;
      if (!repeat) {
        // Raw SQL: increments without touching updated_at (which the admin queue relies on).
        await prisma.$executeRaw`
          UPDATE businesses SET view_count = view_count + 1
          WHERE id = ${businessId}::uuid AND status = 'APPROVED'
            AND (${viewerId}::uuid IS NULL OR owner_id <> ${viewerId}::uuid)`;
      }
      await safely(() =>
        recordBusinessView(req, { businessId, viewerId, repeat, entry: toEntry(body.entry) }),
      );
      return noContent(dedupeCookie);
    }
    default: {
      const { businessId, type } = body;
      const counted = await prisma.$transaction(async (tx) => {
        const updated = await tx.$executeRaw`
          UPDATE businesses SET contact_click_count = contact_click_count + 1
          WHERE id = ${businessId}::uuid AND status = 'APPROVED'
            AND (${viewer?.id ?? null}::uuid IS NULL OR owner_id <> ${viewer?.id ?? null}::uuid)`;
        if (updated === 1) {
          await tx.contactEvent.create({
            data: { businessId, type, userId: viewer?.id ?? null },
          });
        }
        return updated === 1;
      });
      if (counted) await safely(() => recordContact(req, businessId, type));
      return noContent(dedupeCookie);
    }
  }
}
