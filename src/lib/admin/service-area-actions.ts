"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { PUBLIC_TAGS } from "@/lib/business/cache-tags";
import { CATALOG_TAGS } from "@/lib/data/catalog";
import { prisma } from "@/lib/prisma";
import { emailStateWaitlist } from "@/lib/service-areas/waitlist";

// Admin: switch states on/off (service areas) and email a state's waitlist. requireAdmin()
// first (404 for anyone else); every change is in the audit log.

export type ServiceAreaResult = { ok: true; message: string } | { ok: false; error: string };

/** States feed the homepage note, search filters, category pages, sitemap and onboarding. */
function expireStatePages() {
  updateTag(CATALOG_TAGS.locations);
  updateTag(PUBLIC_TAGS.businesses);
}

const toggleSchema = z.object({
  stateId: z.number().int().positive(),
  active: z.boolean(),
  emailWaitlist: z.boolean().optional(),
});

export async function setStateActiveAction(
  input: z.input<typeof toggleSchema>,
): Promise<ServiceAreaResult> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { stateId, active, emailWaitlist } = parsed.data;

  const outcome = await prisma.$transaction(async (tx) => {
    // Lock all states so two admins can't switch off the last two at once.
    await tx.$queryRaw`SELECT id FROM states ORDER BY id FOR UPDATE`;
    const state = await tx.state.findUnique({
      where: { id: stateId },
      select: { name: true, isActive: true },
    });
    if (!state) return { error: "That state doesn't exist." };
    if (state.isActive === active) {
      return {
        error: `${state.name} is already ${active ? "live" : "switched off"}. Reload the page.`,
      };
    }
    if (!active && (await tx.state.count({ where: { isActive: true } })) <= 1) {
      return { error: "At least one state must stay live. Switch another state on first." };
    }
    await tx.state.update({
      where: { id: stateId },
      data: active ? { isActive: true, launchedAt: new Date() } : { isActive: false },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: admin.id,
        action: active ? "STATE_ACTIVATED" : "STATE_DEACTIVATED",
        summary: state.name,
      },
    });
    return { name: state.name };
  });
  if ("error" in outcome) return { ok: false, error: outcome.error! };

  expireStatePages();
  if (active && emailWaitlist) {
    after(async () => {
      const result = await emailStateWaitlist(stateId);
      await prisma.adminAuditLog.create({
        data: {
          actorId: admin.id,
          action: "WAITLIST_NOTIFIED",
          summary: `${outcome.name}: ${result.sent} emailed, ${result.remaining} remaining`,
        },
      });
    });
  }
  refresh();
  return {
    ok: true,
    message: active
      ? `${outcome.name} is now live.${emailWaitlist ? " The waitlist is being emailed in small batches." : ""}`
      : `${outcome.name} is switched off. Existing live listings stay visible; no new listings can be submitted there.`,
  };
}

const stateOnly = z.object({ stateId: z.number().int().positive() });

/** Emails the next batch of the waitlist for a live state (safe to run again: no duplicates). */
export async function emailWaitlistAction(
  input: z.input<typeof stateOnly>,
): Promise<ServiceAreaResult> {
  const admin = await requireAdmin();
  const parsed = stateOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const state = await prisma.state.findUnique({
    where: { id: parsed.data.stateId },
    select: { name: true },
  });
  if (!state) return { ok: false, error: "That state doesn't exist." };
  const result = await emailStateWaitlist(parsed.data.stateId);
  if (result.notLive) {
    return {
      ok: false,
      error: `${state.name} isn't live. Switch it on before emailing its waitlist.`,
    };
  }
  await prisma.adminAuditLog.create({
    data: {
      actorId: admin.id,
      action: "WAITLIST_NOTIFIED",
      summary: `${state.name}: ${result.sent} emailed, ${result.remaining} remaining`,
    },
  });
  refresh();
  return {
    ok: true,
    message:
      result.remaining > 0
        ? `Emailed ${result.sent} people. ${result.remaining} still to email: click again to send the next batch.`
        : `Emailed ${result.sent} people. Everyone on the ${state.name} waitlist has now been emailed.`,
  };
}
