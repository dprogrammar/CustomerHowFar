import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isProbablyBot } from "@/lib/bots";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  businessId: z.uuid(),
  type: z.enum(["view", "WHATSAPP", "CALL", "EMAIL"]),
});

/** Repeat views within 6h (and repeat contact taps within 2 min) by the same browser count once. */
const DEDUPE_SECONDS = { view: 6 * 3600, contact: 120 } as const;

function noContent(cookie?: string) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 204, headers });
}

/**
 * Analytics beacon for public business pages (sent with navigator.sendBeacon after the page
 * has loaded, so it never slows the page). Counts views and WhatsApp/call/email taps for
 * APPROVED businesses only, ignoring bots, the owner's own visits and admins.
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
  const { businessId, type } = parsed.data;

  const kind = type === "view" ? "view" : "contact";
  const cookieName = `chf_t_${kind === "view" ? "v" : type[0]!.toLowerCase()}_${businessId.slice(0, 8)}`;
  if (request.cookies.has(cookieName)) return noContent();
  const dedupeCookie = `${cookieName}=1; Max-Age=${DEDUPE_SECONDS[kind]}; Path=/api/track; HttpOnly; SameSite=Strict${
    request.nextUrl.protocol === "https:" ? "; Secure" : ""
  }`;

  const viewer = await getCurrentUser().catch(() => null);
  if (viewer?.role === "ADMIN") return noContent();

  if (kind === "view") {
    // Raw SQL: increments without touching updated_at (which the admin queue relies on).
    await prisma.$executeRaw`
      UPDATE businesses SET view_count = view_count + 1
      WHERE id = ${businessId}::uuid AND status = 'APPROVED'
        AND (${viewer?.id ?? null}::uuid IS NULL OR owner_id <> ${viewer?.id ?? null}::uuid)`;
    return noContent(dedupeCookie);
  }

  const contactType = type as Exclude<typeof type, "view">;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE businesses SET contact_click_count = contact_click_count + 1
      WHERE id = ${businessId}::uuid AND status = 'APPROVED'
        AND (${viewer?.id ?? null}::uuid IS NULL OR owner_id <> ${viewer?.id ?? null}::uuid)`;
    if (updated === 1) {
      await tx.contactEvent.create({
        data: { businessId, type: contactType, userId: viewer?.id ?? null },
      });
    }
  });
  return noContent(dedupeCookie);
}
