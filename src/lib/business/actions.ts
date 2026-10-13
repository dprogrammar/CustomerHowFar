"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { notifyAdminOfSubmission } from "@/lib/email/notifications";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/lib/auth/actions";
import { ensureProfile } from "@/lib/auth/profile";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { deleteCloudinaryImage, userUploadFolder, verifyUploadedImage } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { STATE_NOT_LIVE_MESSAGE } from "@/lib/service-areas/rules";
import { isStateActive } from "@/lib/service-areas/server";
import {
  aboutSchema,
  addPhotoSchema,
  basicsSchema,
  brandImageSchema,
  captionSchema,
  locationSchema,
  moveSchema,
  normalizeSocial,
  parseOpeningHours,
  photoRefSchema,
} from "@/lib/validation/business";
import type { FieldErrors } from "@/lib/validation/auth";
import { findOwnedBusiness, getPaymentSettings, hasSuccessfulPayment } from "./queries";
import {
  MAX_BUSINESSES_PER_USER,
  MAX_WORK_PHOTOS,
  MISSING_LABELS,
  SUBMITTABLE_STATUSES,
  canOwnerEdit,
  canSubmit,
  getCompleteness,
  missingItems,
  statusAfterSubmit,
  type BusinessStatus,
} from "./rules";
import { revalidatePublicBusiness } from "./revalidate";
import { uniqueBusinessSlug } from "./slug";

// ---------------------------------------------------------------------------------------
// Helpers. Every action re-reads the session and ownership on the server; nothing the
// browser sends (ids, statuses) is trusted.
// ---------------------------------------------------------------------------------------

const NOT_FOUND = "We couldn't find that business. It may have been removed.";
const SUSPENDED = "This listing is suspended and can't be edited. Contact support for help.";

async function requireSession(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=%2Fdashboard");
  return session;
}

function fieldErrorsOf(error: z.ZodError): FieldErrors {
  // One message per field: several rules can fail on the same input (e.g. empty + format).
  const all = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(
    Object.entries(all).map(([field, messages]) => [field, messages?.slice(0, 1)]),
  ) as FieldErrors;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function stepUrl(businessId: string, step: number) {
  return `/business/${businessId}/edit?step=${step}`;
}

/** After an owner edits a live listing, refresh its public pages (after the DB write). */
function afterLiveEdit(business: { status: BusinessStatus; slug: string }) {
  if (business.status === "APPROVED") revalidatePublicBusiness(business.slug);
}

/** Edits to a live listing keep it live but flag it for an admin to look at again. */
function recheckIfLive(status: BusinessStatus) {
  return status === "APPROVED" ? { needsRecheck: true } : {};
}

type OwnedBusiness = NonNullable<Awaited<ReturnType<typeof findOwnedBusiness>>>;

/** The business if the user owns it and may edit it; otherwise an error message. */
async function loadEditable(
  businessId: string,
  userId: string,
): Promise<{ business: OwnedBusiness; error?: never } | { error: string; business?: never }> {
  const business = await findOwnedBusiness(businessId, userId);
  if (!business) return { error: NOT_FOUND };
  if (!canOwnerEdit(business.status)) return { error: SUSPENDED };
  return { business };
}

function isUniqueViolation(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes(field);
}

// ---------------------------------------------------------------------------------------
// Step 1: Basics (creates the DRAFT business)
// ---------------------------------------------------------------------------------------

export async function saveBasicsAction(
  businessId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const values = {
    name: text(formData, "name"),
    categoryId: text(formData, "categoryId"),
    tagline: text(formData, "tagline"),
    phone: text(formData, "phone"),
    whatsappNumber: text(formData, "whatsappNumber"),
    sameAsPhone: text(formData, "sameAsPhone"),
    email: text(formData, "email"),
  };
  const parsed = basicsSchema.safeParse({
    ...values,
    sameAsPhone: values.sameAsPhone === "on" ? "on" : undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };

  const category = await prisma.category.findFirst({
    where: { id: parsed.data.categoryId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    return { status: "error", fieldErrors: { categoryId: ["Choose a category."] }, values };
  }

  const data = {
    name: parsed.data.name,
    categoryId: category.id,
    tagline: parsed.data.tagline,
    phone: parsed.data.phone,
    whatsappNumber: parsed.data.whatsappNumber,
    email: parsed.data.email,
  };

  if (!businessId) {
    await ensureProfile(session);
    const created = await createDraft(session.id, data);
    if ("error" in created) return { status: "error", message: created.error, values };
    redirect(stepUrl(created.id, 2));
  }

  const loaded = await loadEditable(businessId, session.id);
  if (loaded.error !== undefined) return { status: "error", message: loaded.error, values };
  const { business } = loaded;

  // Drafts get a fresh slug when renamed; published slugs never change (links and SEO).
  const slug =
    business.status === "DRAFT" && business.name !== data.name
      ? await uniqueBusinessSlug(prisma, data.name, business.id)
      : undefined;

  await prisma.business.update({
    where: { id: business.id },
    data: { ...data, ...(slug ? { slug } : {}), ...recheckIfLive(business.status) },
  });
  afterLiveEdit(business);
  redirect(stepUrl(business.id, 2));
}

async function createDraft(
  userId: string,
  data: {
    name: string;
    categoryId: string;
    tagline: string | null;
    phone: string;
    whatsappNumber: string;
    email: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Lock the owner's profile so two tabs can't both create a 6th business.
        await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${userId}::uuid FOR UPDATE`;
        const count = await tx.business.count({
          where: { ownerId: userId, status: { not: "DELETED" } },
        });
        if (count >= MAX_BUSINESSES_PER_USER) {
          return {
            error: `You can list up to ${MAX_BUSINESSES_PER_USER} businesses. Contact support if you need more.`,
          };
        }
        const slug = await uniqueBusinessSlug(tx, data.name);
        const business = await tx.business.create({
          data: { ...data, slug, ownerId: userId, status: "DRAFT" },
          select: { id: true },
        });
        // First business: customer becomes a business owner. Admins are never downgraded.
        await tx.profile.updateMany({
          where: { id: userId, role: "CUSTOMER" },
          data: { role: "BUSINESS_OWNER" },
        });
        return business;
      });
    } catch (error) {
      if (isUniqueViolation(error, "slug")) continue; // Lost a race for the slug; try again.
      throw error;
    }
  }
  return { error: "We couldn't save your business. Please try again." };
}

// ---------------------------------------------------------------------------------------
// Step 2: Location
// ---------------------------------------------------------------------------------------

export async function saveLocationAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const values = {
    stateId: text(formData, "stateId"),
    lgaId: text(formData, "lgaId"),
    address: text(formData, "address"),
    area: text(formData, "area"),
  };
  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };

  const lga = await prisma.lga.findFirst({
    where: { id: parsed.data.lgaId, stateId: parsed.data.stateId },
    select: { id: true },
  });
  if (!lga) {
    return {
      status: "error",
      fieldErrors: { lgaId: ["Choose an LGA in the selected state."] },
      values,
    };
  }

  const loaded = await loadEditable(businessId, session.id);
  if (loaded.error !== undefined) return { status: "error", message: loaded.error, values };

  // New listings only in live states. A draft (or live listing) already in a state that was
  // later switched off may keep that state and still be saved.
  if (
    parsed.data.stateId !== loaded.business.stateId &&
    !(await isStateActive(parsed.data.stateId))
  ) {
    return {
      status: "error",
      message: STATE_NOT_LIVE_MESSAGE,
      fieldErrors: { stateId: ["This state isn't open for new listings yet."] },
      values,
    };
  }

  await prisma.business.update({
    where: { id: loaded.business.id },
    data: { ...parsed.data, ...recheckIfLive(loaded.business.status) },
  });
  afterLiveEdit(loaded.business);
  redirect(stepUrl(loaded.business.id, 3));
}

// ---------------------------------------------------------------------------------------
// Step 3: About
// ---------------------------------------------------------------------------------------

export async function saveAboutAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const services = formData.getAll("services").filter((s): s is string => typeof s === "string");
  const values = {
    description: text(formData, "description"),
    yearsOfExperience: text(formData, "yearsOfExperience"),
    instagram: text(formData, "instagram"),
    facebook: text(formData, "facebook"),
    tiktok: text(formData, "tiktok"),
    website: text(formData, "website"),
  };

  const parsed = aboutSchema.safeParse({ ...values, services });
  const fieldErrors: FieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);

  const socials: Record<string, string | null> = {};
  for (const kind of ["instagram", "facebook", "tiktok", "website"] as const) {
    const result = normalizeSocial(kind, values[kind]);
    if ("error" in result) fieldErrors[kind] = [result.error];
    else socials[kind] = result.url;
  }

  const hours = parseOpeningHours(formData);
  if ("error" in hours) fieldErrors.openingHours = [hours.error];

  if (!parsed.success || Object.keys(fieldErrors).length > 0 || "error" in hours) {
    return { status: "error", fieldErrors, values: { ...values, services: services.join("\n") } };
  }

  const loaded = await loadEditable(businessId, session.id);
  if (loaded.error !== undefined) return { status: "error", message: loaded.error, values };

  await prisma.business.update({
    where: { id: loaded.business.id },
    data: {
      description: parsed.data.description,
      yearsOfExperience: parsed.data.yearsOfExperience,
      services: parsed.data.services,
      openingHours: hours.hours ?? Prisma.DbNull,
      instagramUrl: socials.instagram,
      facebookUrl: socials.facebook,
      tiktokUrl: socials.tiktok,
      websiteUrl: socials.website,
      ...recheckIfLive(loaded.business.status),
    },
  });
  afterLiveEdit(loaded.business);
  redirect(stepUrl(loaded.business.id, 4));
}

// ---------------------------------------------------------------------------------------
// Step 4: Photos (called directly from the photo manager, not as form actions)
// ---------------------------------------------------------------------------------------

export type PhotoRecord = {
  id: string;
  publicId: string;
  width: number;
  height: number;
  caption: string | null;
  sortOrder: number;
};

export type PhotoResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const UNVERIFIED =
  "We couldn't verify that image. Please upload a JPG, PNG or WebP photo under 5 MB.";

class PhotoLimitError extends Error {}

export async function addPhotoAction(
  input: z.input<typeof addPhotoSchema>,
): Promise<
  PhotoResult<{ kind: "logo" | "cover"; publicId: string } | { kind: "work"; photo: PhotoRecord }>
> {
  const session = await requireSession();
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: UNVERIFIED };
  const { businessId, kind, publicId, caption } = parsed.data;

  const loaded = await loadEditable(businessId, session.id);
  if (loaded.error !== undefined) {
    await deleteIfOwnUpload(publicId, session.id);
    return { ok: false, error: loaded.error };
  }

  // Must exist in Cloudinary, inside this user's folder, be an allowed format and <= 5 MB.
  const verified = await verifyUploadedImage(publicId, userUploadFolder(session.id));
  if (!verified) return { ok: false, error: UNVERIFIED };

  if (kind === "logo" || kind === "cover") {
    const field = kind === "logo" ? "logoPublicId" : "coverPublicId";
    const previous = loaded.business[field];
    await prisma.business.update({
      where: { id: businessId },
      data: { [field]: verified.publicId, ...recheckIfLive(loaded.business.status) },
    });
    afterLiveEdit(loaded.business);
    if (previous && previous !== verified.publicId) await deleteCloudinaryImage(previous);
    return { ok: true, data: { kind, publicId: verified.publicId } };
  }

  try {
    const photo = await prisma.$transaction(async (tx) => {
      // Serialize photo inserts per business so the 12-photo limit can't be raced.
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
      const count = await tx.businessPhoto.count({ where: { businessId } });
      if (count >= MAX_WORK_PHOTOS) throw new PhotoLimitError();
      const last = await tx.businessPhoto.aggregate({
        where: { businessId },
        _max: { sortOrder: true },
      });
      const created = await tx.businessPhoto.create({
        data: {
          businessId,
          publicId: verified.publicId,
          width: verified.width,
          height: verified.height,
          caption: caption || null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: {
          id: true,
          publicId: true,
          width: true,
          height: true,
          caption: true,
          sortOrder: true,
        },
      });
      if (loaded.business.status === "APPROVED") {
        await tx.business.update({ where: { id: businessId }, data: { needsRecheck: true } });
      }
      return created;
    });
    afterLiveEdit(loaded.business);
    return { ok: true, data: { kind: "work", photo } };
  } catch (error) {
    if (error instanceof PhotoLimitError) {
      await deleteCloudinaryImage(verified.publicId);
      return { ok: false, error: `You can add up to ${MAX_WORK_PHOTOS} work photos.` };
    }
    if (isUniqueViolation(error)) return { ok: false, error: "That photo has already been added." };
    throw error;
  }
}

async function deleteIfOwnUpload(publicId: string, userId: string) {
  if (publicId.startsWith(`${userUploadFolder(userId)}/`)) await deleteCloudinaryImage(publicId);
}

export async function removePhotoAction(
  input: z.input<typeof photoRefSchema>,
): Promise<PhotoResult> {
  const session = await requireSession();
  const parsed = photoRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  const loaded = await loadEditable(parsed.data.businessId, session.id);
  if (loaded.error !== undefined) return { ok: false, error: loaded.error };

  const photo = await prisma.businessPhoto.findFirst({
    where: { id: parsed.data.photoId, businessId: loaded.business.id },
  });
  if (!photo) return { ok: false, error: "That photo was already removed." };

  await prisma.$transaction([
    prisma.businessPhoto.delete({ where: { id: photo.id } }),
    prisma.business.update({
      where: { id: loaded.business.id },
      data: recheckIfLive(loaded.business.status),
    }),
  ]);
  afterLiveEdit(loaded.business);
  await deleteCloudinaryImage(photo.publicId);
  return { ok: true, data: undefined };
}

export async function removeBrandImageAction(
  input: z.input<typeof brandImageSchema>,
): Promise<PhotoResult> {
  const session = await requireSession();
  const parsed = brandImageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  const loaded = await loadEditable(parsed.data.businessId, session.id);
  if (loaded.error !== undefined) return { ok: false, error: loaded.error };

  const field = parsed.data.kind === "logo" ? "logoPublicId" : "coverPublicId";
  const previous = loaded.business[field];
  await prisma.business.update({
    where: { id: loaded.business.id },
    data: { [field]: null, ...recheckIfLive(loaded.business.status) },
  });
  afterLiveEdit(loaded.business);
  await deleteCloudinaryImage(previous);
  return { ok: true, data: undefined };
}

export async function updatePhotoCaptionAction(
  input: z.input<typeof captionSchema>,
): Promise<PhotoResult> {
  const session = await requireSession();
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid caption." };
  }

  const loaded = await loadEditable(parsed.data.businessId, session.id);
  if (loaded.error !== undefined) return { ok: false, error: loaded.error };

  const { count } = await prisma.businessPhoto.updateMany({
    where: { id: parsed.data.photoId, businessId: loaded.business.id },
    data: { caption: parsed.data.caption || null },
  });
  if (count === 0) return { ok: false, error: "That photo was removed." };
  if (loaded.business.status === "APPROVED") {
    await prisma.business.update({
      where: { id: loaded.business.id },
      data: { needsRecheck: true },
    });
  }
  afterLiveEdit(loaded.business);
  return { ok: true, data: undefined };
}

export async function movePhotoAction(
  input: z.input<typeof moveSchema>,
): Promise<PhotoResult<PhotoRecord[]>> {
  const session = await requireSession();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  const loaded = await loadEditable(parsed.data.businessId, session.id);
  if (loaded.error !== undefined) return { ok: false, error: loaded.error };
  const businessId = loaded.business.id;

  const photos = await prisma.$transaction(async (tx) => {
    const list = await tx.businessPhoto.findMany({
      where: { businessId },
      orderBy: { sortOrder: "asc" },
    });
    const index = list.findIndex((p) => p.id === parsed.data.photoId);
    const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
    if (index !== -1 && swapWith >= 0 && swapWith < list.length) {
      [list[index], list[swapWith]] = [list[swapWith]!, list[index]!];
      // Rewrite a clean 0..n-1 order.
      await Promise.all(
        list.map((p, i) =>
          tx.businessPhoto.update({ where: { id: p.id }, data: { sortOrder: i } }),
        ),
      );
      if (loaded.business.status === "APPROVED") {
        await tx.business.update({ where: { id: businessId }, data: { needsRecheck: true } });
      }
    }
    return tx.businessPhoto.findMany({
      where: { businessId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        publicId: true,
        width: true,
        height: true,
        caption: true,
        sortOrder: true,
      },
    });
  });
  afterLiveEdit(loaded.business);
  return { ok: true, data: photos };
}

// ---------------------------------------------------------------------------------------
// Step 5: Submit (the payment gate)
// ---------------------------------------------------------------------------------------

export async function submitBusinessAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  if (formData.get("acceptTerms") !== "on") {
    return {
      status: "error",
      fieldErrors: { acceptTerms: ["Please confirm the listing terms to submit."] },
    };
  }

  const business = await findOwnedBusiness(businessId, session.id);
  if (!business) return { status: "error", message: NOT_FOUND };
  if (!canSubmit(business.status)) {
    return {
      status: "error",
      message:
        business.status === "SUSPENDED"
          ? SUSPENDED
          : "This listing has already been submitted. You'll be notified when it's reviewed.",
    };
  }

  if (business.stateId && !(await isStateActive(business.stateId))) {
    return { status: "error", message: STATE_NOT_LIVE_MESSAGE };
  }

  const workPhotoCount = await prisma.businessPhoto.count({ where: { businessId } });
  const missing = missingItems(getCompleteness({ ...business, workPhotoCount }));
  if (missing.length > 0) {
    return {
      status: "error",
      message: `Please complete: ${missing.map((m) => MISSING_LABELS[m]).join(", ")}.`,
    };
  }

  // Everything that decides the next status is read here, on the server.
  const { paymentRequired } = await getPaymentSettings();
  const hasPaid = await hasSuccessfulPayment(businessId);
  const nextStatus = statusAfterSubmit({ paymentRequired, hasPaid });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
    return tx.business.updateMany({
      // Only move from a submittable status (guards against double submits and races).
      where: { id: businessId, ownerId: session.id, status: { in: [...SUBMITTABLE_STATUSES] } },
      // feeRequiredAtSubmit records the fee switch at this moment: listings submitted while
      // the fee is off are honored for free; otherwise approval requires a payment.
      data:
        nextStatus === "PENDING_REVIEW"
          ? {
              status: nextStatus,
              feeRequiredAtSubmit: paymentRequired,
              submittedAt: new Date(),
              needsRecheck: false,
              rejectionReason: null,
            }
          : { status: nextStatus, feeRequiredAtSubmit: paymentRequired },
    });
  });
  if (updated.count === 0) {
    return { status: "error", message: "This listing has already been submitted." };
  }

  if (nextStatus === "PENDING_REVIEW") {
    // After the response: email never delays or undoes the submission.
    const resubmission = business.submittedAt !== null || business.status === "REJECTED";
    after(() => notifyAdminOfSubmission(businessId, resubmission));
  }

  redirect(
    nextStatus === "PENDING_PAYMENT"
      ? `/business/${businessId}/pay`
      : `/business/${businessId}/submitted`,
  );
}
