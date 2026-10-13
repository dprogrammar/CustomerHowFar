import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { privateDownloadUrl } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

const KINDS = ["front", "back", "selfie"] as const;

/**
 * Admin-only ID image viewer. Redirects to a Cloudinary download URL signed with the API secret
 * that expires in 5 minutes. The images are private assets with no public URL, and are never
 * shown to the owner after submission. Nothing about the request is logged.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/identity/[id]/image/[kind]">,
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "ADMIN") return notFound();

  const { id, kind } = await params;
  if (!z.uuid().safeParse(id).success || !KINDS.includes(kind as (typeof KINDS)[number]))
    return notFound();
  const v = await prisma.identityVerification.findUnique({
    where: { id },
    select: {
      idFrontPublicId: true,
      idFrontFormat: true,
      idBackPublicId: true,
      idBackFormat: true,
      selfiePublicId: true,
      selfieFormat: true,
    },
  });
  if (!v) return notFound();
  const [publicId, format] =
    kind === "front"
      ? [v.idFrontPublicId, v.idFrontFormat]
      : kind === "back"
        ? [v.idBackPublicId, v.idBackFormat]
        : [v.selfiePublicId, v.selfieFormat];
  if (!publicId || !format) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      Location: privateDownloadUrl(publicId, format, { expiresInSeconds: 300 }),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
