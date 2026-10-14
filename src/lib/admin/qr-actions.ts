"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_NAME } from "@/lib/qr/rules";

// Admin: keep a list of QR code campaigns (the codes themselves are generated in the browser).

export type QrActionResult = { ok: true } | { ok: false; error: string };

export async function saveQrCampaignAction(input: { name: string }): Promise<QrActionResult> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      name: z
        .string()
        .regex(CAMPAIGN_NAME, "Use lowercase letters, numbers and dashes (up to 40), e.g. flyer."),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid campaign name." };
  }
  await prisma.qrCampaign.upsert({
    where: { name: parsed.data.name },
    create: { name: parsed.data.name, createdById: admin.id },
    update: {},
  });
  refresh();
  return { ok: true };
}
