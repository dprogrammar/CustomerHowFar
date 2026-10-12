import { z } from "zod";
import {
  DAYS,
  type OpeningHours,
  CAPTION_MAX,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MAX_SERVICES,
  SERVICE_MAX_LENGTH,
  TAGLINE_MAX,
} from "@/lib/business/rules";

// Server-side validation for the business wizard. Keep out of client components.

const NG_MOBILE = /^(\+?234|0)?[789][01]\d{8}$/;

/** Required Nigerian mobile number, normalized to +234XXXXXXXXXX. */
export const requiredNigerianMobile = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .refine((value) => value.length > 0, { message: `Enter the ${label}.` })
    .refine((value) => value.length === 0 || NG_MOBILE.test(value), {
      message: "Enter a valid Nigerian mobile number, e.g. 0803 123 4567.",
    })
    .transform((value) => `+234${value.slice(-10)}`);

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((value) => (value === "" ? null : value));

export const basicsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your business name.")
      .max(80, "Use 80 characters or fewer.")
      .regex(/[\p{L}\p{N}]/u, "Enter your business name."),
    categoryId: z.uuid("Choose a category."),
    tagline: optionalText(TAGLINE_MAX, `Keep the tagline under ${TAGLINE_MAX} characters.`),
    phone: requiredNigerianMobile("phone number"),
    sameAsPhone: z.literal("on").optional(),
    whatsappNumber: z.string().optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email address is too long.")
      .refine(
        (v) => v === "" || z.email().safeParse(v).success,
        "Enter a valid email address, or leave it empty.",
      )
      .transform((v) => (v === "" ? null : v)),
  })
  .transform((data, ctx) => {
    if (data.sameAsPhone) return { ...data, whatsappNumber: data.phone };
    const parsed = requiredNigerianMobile("WhatsApp number").safeParse(data.whatsappNumber ?? "");
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["whatsappNumber"],
        message: parsed.error.issues[0]?.message ?? "Enter a valid WhatsApp number.",
      });
      return z.NEVER;
    }
    return { ...data, whatsappNumber: parsed.data };
  });

export const locationSchema = z.object({
  stateId: z.coerce.number({ error: "Choose a state." }).int().positive("Choose a state."),
  lgaId: z.coerce.number({ error: "Choose an LGA." }).int().positive("Choose an LGA."),
  address: z
    .string()
    .trim()
    .min(5, "Enter the street address.")
    .max(200, "Use 200 characters or fewer."),
  area: optionalText(120, "Use 120 characters or fewer."),
});

// --- Social links -----------------------------------------------------------------------

function tryUrl(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function hostIs(url: URL, domains: string[]) {
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  return domains.includes(host);
}

/** Accepts @handle, handle or a profile URL; returns a clean https URL or an error. */
export function normalizeSocial(
  kind: "instagram" | "tiktok" | "facebook" | "website",
  raw: string,
): { url: string | null } | { error: string } {
  const value = raw.trim();
  if (!value) return { url: null };
  if (value.length > 200) return { error: "That link is too long." };

  if (kind === "instagram") {
    const url = value.includes("instagram.com") ? tryUrl(value) : null;
    const handle =
      url && hostIs(url, ["instagram.com"]) ? url.pathname.split("/")[1] : value.replace(/^@/, "");
    if (!handle || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
      return { error: "Enter an Instagram handle like @yourbusiness." };
    }
    return { url: `https://www.instagram.com/${handle}` };
  }

  if (kind === "tiktok") {
    const url = value.includes("tiktok.com") ? tryUrl(value) : null;
    const segment = url && hostIs(url, ["tiktok.com"]) ? url.pathname.split("/")[1] : value;
    const handle = segment?.replace(/^@/, "");
    if (!handle || !/^[A-Za-z0-9._]{2,24}$/.test(handle)) {
      return { error: "Enter a TikTok handle like @yourbusiness." };
    }
    return { url: `https://www.tiktok.com/@${handle}` };
  }

  if (kind === "facebook") {
    if (/facebook\.com|fb\.com/i.test(value)) {
      const url = tryUrl(value);
      if (!url || !hostIs(url, ["facebook.com", "fb.com"]) || url.pathname.length < 2) {
        return { error: "Enter a Facebook page link or name." };
      }
      return { url: `https://www.facebook.com${url.pathname}${url.search}` };
    }
    if (!/^[A-Za-z0-9.\-]{2,50}$/.test(value))
      return { error: "Enter a Facebook page link or name." };
    return { url: `https://www.facebook.com/${value}` };
  }

  const url = tryUrl(value);
  if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    return { error: "Enter a website address like www.yourbusiness.com." };
  }
  url.protocol = "https:";
  return { url: url.toString() };
}

// --- Opening hours ----------------------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads hours_enabled, closed_<day>, open_<day>, close_<day> fields. */
export function parseOpeningHours(
  formData: FormData,
): { hours: OpeningHours | null } | { error: string } {
  if (formData.get("hoursEnabled") !== "on") return { hours: null };
  const hours = {} as OpeningHours;
  for (const { key, label } of DAYS) {
    if (formData.get(`closed_${key}`) === "on") {
      hours[key] = null;
      continue;
    }
    const open = String(formData.get(`open_${key}`) ?? "");
    const close = String(formData.get(`close_${key}`) ?? "");
    if (!TIME.test(open) || !TIME.test(close))
      return { error: `Set opening and closing times for ${label}, or mark it closed.` };
    if (open >= close) return { error: `${label}: closing time must be after opening time.` };
    hours[key] = { open, close };
  }
  return { hours };
}

export const aboutSchema = z.object({
  description: z
    .string()
    .trim()
    .min(DESCRIPTION_MIN, `Write at least ${DESCRIPTION_MIN} characters about your business.`)
    .max(DESCRIPTION_MAX, `Use ${DESCRIPTION_MAX} characters or fewer.`),
  yearsOfExperience: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 80) {
        ctx.addIssue({ code: "custom", message: "Enter a number of years between 0 and 80." });
        return z.NEVER;
      }
      return n;
    }),
  services: z
    .array(
      z
        .string()
        .trim()
        .min(2, "Each service needs at least 2 characters.")
        .max(SERVICE_MAX_LENGTH, `Keep each service under ${SERVICE_MAX_LENGTH} characters.`),
    )
    .max(MAX_SERVICES, `Add up to ${MAX_SERVICES} services.`)
    .transform((list) => {
      const seen = new Set<string>();
      return list.filter((s) => {
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
});

// --- Photos -----------------------------------------------------------------------------

const businessId = z.uuid();

export const addPhotoSchema = z.object({
  businessId,
  kind: z.enum(["logo", "cover", "work"]),
  publicId: z.string().min(1).max(300),
  caption: z.string().trim().max(CAPTION_MAX).optional(),
});

export const photoRefSchema = z.object({ businessId, photoId: z.uuid() });

export const brandImageSchema = z.object({ businessId, kind: z.enum(["logo", "cover"]) });

export const captionSchema = z.object({
  businessId,
  photoId: z.uuid(),
  caption: z.string().trim().max(CAPTION_MAX, `Keep captions under ${CAPTION_MAX} characters.`),
});

export const moveSchema = z.object({
  businessId,
  photoId: z.uuid(),
  direction: z.enum(["up", "down"]),
});
