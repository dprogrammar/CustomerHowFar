import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { proofDownloadUrl } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Admin-only proof viewer. Redirects to a Cloudinary download URL signed with the API secret
 * that expires in 5 minutes. The proof itself is a private asset with no public URL.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/admin/payments/[id]/proof">,
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "ADMIN") return notFound();

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { proofPublicId: true, proofFormat: true },
  });
  if (!payment?.proofPublicId || !payment.proofFormat) return notFound();

  const url = proofDownloadUrl(payment.proofPublicId, payment.proofFormat, {
    expiresInSeconds: 300,
    attachment: request.nextUrl.searchParams.get("download") === "1",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
