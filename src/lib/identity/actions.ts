"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { deletePrivateFile, sealPrivateFile, verifyPrivateUpload } from "@/lib/cloudinary";
import { notifyAdminOfIdentity } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { MAX_SUBMISSIONS_PER_DAY } from "./rules";
import { deleteIdentityImages } from "./server";

// Owner-side identity check. The browser only ever sends upload IDs from the user's own private
// folder; every file is checked and renamed on the server before it's recorded. ID numbers are
// never collected. Nothing here logs names or image IDs.

export type IdentityActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const uploadId = z.string().min(1).max(300);

const submitSchema = z.object({
  idType: z.enum(["NIN_SLIP", "VOTERS_CARD", "DRIVERS_LICENCE", "INTERNATIONAL_PASSPORT"], {
    error: "Choose the type of ID.",
  }),
  fullNameOnId: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, "Type your full name exactly as it appears on your ID.")
        .max(120, "Use 120 characters or fewer.")
        .regex(/^[\p{L}\p{M}' .-]+$/u, "Use letters only, as printed on your ID."),
    ),
  idFrontPublicId: uploadId.optional().or(z.literal("")),
  idBackPublicId: uploadId.optional().or(z.literal("")),
  selfiePublicId: uploadId.optional().or(z.literal("")),
  consent: z.literal(true, { error: "Please tick the consent box to continue." }),
});

type SubmitInput = z.input<typeof submitSchema>;

async function discard(userId: string, ids: (string | undefined)[]) {
  const own = `customerhowfar/identity/${userId}/`;
  await Promise.all(
    ids.filter((id): id is string => !!id && id.startsWith(own)).map((id) => deletePrivateFile(id)),
  );
}

export async function submitIdentityAction(input: SubmitInput): Promise<IdentityActionResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Please log in again." };
  const uploaded = [input?.idFrontPublicId, input?.idBackPublicId, input?.selfiePublicId].map(
    (v) => (typeof v === "string" ? v : undefined),
  );

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;
  if (!data.idFrontPublicId) {
    return {
      ok: false,
      error: "Please upload a photo of your ID.",
      fieldErrors: { idFrontPublicId: ["Upload a photo of your ID."] },
    };
  }
  if (!data.selfiePublicId) {
    return {
      ok: false,
      error: "Please upload a selfie holding your ID.",
      fieldErrors: { selfiePublicId: ["Upload a selfie holding your ID."] },
    };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.identityVerification.count({
    where: { userId: session.id, submittedAt: { gte: since } },
  });
  if (recent >= MAX_SUBMISSIONS_PER_DAY) {
    await discard(session.id, uploaded);
    return {
      ok: false,
      error: `You can submit your ID up to ${MAX_SUBMISSIONS_PER_DAY} times a day. Please try again tomorrow.`,
    };
  }
  const accepted = await prisma.identityVerification.findFirst({
    where: { userId: session.id, status: "APPROVED" },
    select: { id: true },
  });
  if (accepted) {
    await discard(session.id, uploaded);
    return { ok: false, error: "Your ID has already been accepted. There's nothing more to do." };
  }

  // Each file must be a private jpg/png/webp of at most 5 MB in this user's identity folder.
  const files = {
    front: await verifyPrivateUpload("identity", data.idFrontPublicId, session.id),
    back: data.idBackPublicId
      ? await verifyPrivateUpload("identity", data.idBackPublicId, session.id)
      : null,
    selfie: await verifyPrivateUpload("identity", data.selfiePublicId, session.id),
  };
  if (!files.front || !files.selfie || (data.idBackPublicId && !files.back)) {
    await discard(session.id, uploaded);
    return {
      ok: false,
      error:
        "We couldn't verify your photos. Upload clear JPG, PNG or WebP photos (max 5 MB each) and try again.",
    };
  }

  // Rename every file so the signed URLs the browser got from Cloudinary stop working.
  const sealed = {
    front: await sealPrivateFile("identity", files.front.publicId, session.id, "id-front"),
    back: files.back
      ? await sealPrivateFile("identity", files.back.publicId, session.id, "id-back")
      : null,
    selfie: await sealPrivateFile("identity", files.selfie.publicId, session.id, "selfie"),
  };
  if (!sealed.front || !sealed.selfie || (files.back && !sealed.back)) {
    await Promise.all(
      [
        sealed.front ?? files.front.publicId,
        sealed.back ?? files.back?.publicId,
        sealed.selfie ?? files.selfie.publicId,
      ]
        .filter(Boolean)
        .map((id) => deletePrivateFile(id)),
    );
    return { ok: false, error: "Upload failed. Please try again." };
  }

  let created: { id: string; superseded: string[]; resubmission: boolean } | null = null;
  try {
    created = await prisma.$transaction(async (tx) => {
      // One submission at a time per user.
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${session.id}::uuid FOR UPDATE`;
      const again = await tx.identityVerification.count({
        where: { userId: session.id, submittedAt: { gte: since } },
      });
      if (again >= MAX_SUBMISSIONS_PER_DAY) return null;
      const previous = await tx.identityVerification.findMany({
        where: { userId: session.id, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
        select: { id: true, status: true },
      });
      if (previous.some((p) => p.status === "APPROVED")) return null;
      const pending = previous.filter((p) => p.status === "PENDING").map((p) => p.id);
      if (pending.length > 0) {
        await tx.identityVerification.updateMany({
          where: { id: { in: pending } },
          data: { status: "SUPERSEDED" },
        });
      }
      const row = await tx.identityVerification.create({
        data: {
          userId: session.id,
          idType: data.idType,
          fullNameOnId: data.fullNameOnId,
          idFrontPublicId: sealed.front,
          idFrontFormat: files.front!.format,
          idBackPublicId: sealed.back,
          idBackFormat: files.back?.format ?? null,
          selfiePublicId: sealed.selfie,
          selfieFormat: files.selfie!.format,
          consentGivenAt: new Date(),
        },
        select: { id: true },
      });
      return { id: row.id, superseded: pending, resubmission: previous.length > 0 };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
      throw error;
  }

  if (!created) {
    await Promise.all(
      [sealed.front, sealed.back, sealed.selfie].map((id) => deletePrivateFile(id)),
    );
    return { ok: false, error: "We couldn't save your submission. Reload the page and try again." };
  }

  const { id, superseded, resubmission } = created;
  after(async () => {
    // Replaced submissions are never reviewed, so their images go straight away.
    await deleteIdentityImages(superseded);
    await notifyAdminOfIdentity(id, resubmission);
  });
  refresh();
  return { ok: true, message: "Thank you. Your ID has been submitted for review." };
}

/** Takes back an unreviewed submission; its images are deleted immediately. */
export async function withdrawIdentityAction(): Promise<IdentityActionResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Please log in again." };
  const pending = await prisma.identityVerification.findMany({
    where: { userId: session.id, status: "PENDING" },
    select: { id: true },
  });
  const ids = pending.map((p) => p.id);
  const { count } = await prisma.identityVerification.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "WITHDRAWN" },
  });
  if (count === 0)
    return { ok: false, error: "There's no submission waiting for review. Reload the page." };
  await deleteIdentityImages(ids);
  refresh();
  return { ok: true, message: "Submission withdrawn and your photos deleted." };
}
