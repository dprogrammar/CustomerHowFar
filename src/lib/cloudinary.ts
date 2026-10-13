import "server-only";
import { randomBytes } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { ALLOWED_IMAGE_FORMATS, MAX_IMAGE_BYTES, UPLOAD_FOLDER } from "@/config/uploads";

type CloudinaryEnv = { cloudName: string; apiKey: string; apiSecret: string };

let env: CloudinaryEnv | undefined;

/** Validates the Cloudinary env values once and configures the SDK. Throws if any is missing. */
function getCloudinaryEnv(): CloudinaryEnv {
  if (env) return env;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const missing = [
    !cloudName && "CLOUDINARY_CLOUD_NAME",
    !apiKey && "CLOUDINARY_API_KEY",
    !apiSecret && "CLOUDINARY_API_SECRET",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Missing Cloudinary environment variable(s): ${missing.join(", ")}.`);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  env = { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
  return env;
}

/** Returns the configured Cloudinary SDK (server-only). */
export function getCloudinary() {
  getCloudinaryEnv();
  return cloudinary;
}

export type ImageUploadSignature = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  maxFileBytes: number;
  /** Delivery type. "authenticated" = private (payment proofs). Omitted = public. */
  type?: "authenticated";
};

/**
 * Each user uploads into their own folder. Saving a photo checks the folder, so a user can
 * never attach an image someone else uploaded.
 */
export function userUploadFolder(userId: string) {
  return `${UPLOAD_FOLDER}/users/${userId}`;
}

/**
 * Signs a direct browser-to-Cloudinary image upload into the user's folder. The browser must
 * send back exactly the signed params (folder, allowed_formats, timestamp); any other param is
 * rejected by Cloudinary. Signatures expire one hour after `timestamp`.
 */
export function createImageUploadSignature(userId: string): ImageUploadSignature {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const timestamp = Math.round(Date.now() / 1000);
  const allowedFormats = ALLOWED_IMAGE_FORMATS.join(",");
  const folder = userUploadFolder(userId);

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats },
    apiSecret,
  );

  return {
    cloudName,
    apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    timestamp,
    signature,
    folder,
    allowedFormats,
    maxFileBytes: MAX_IMAGE_BYTES,
  };
}

export type VerifiedImage = {
  publicId: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
};

/**
 * Cloudinary cannot enforce a byte limit on signed uploads, so verify every uploaded image on
 * the server before saving its public ID (e.g. to a listing). Images that break the rules are
 * deleted. Pass `folder` (e.g. userUploadFolder(userId)) to also require that the image was
 * uploaded into that folder. Returns null when the image is missing or was rejected.
 */
export async function verifyUploadedImage(
  publicId: string,
  folder: string = UPLOAD_FOLDER,
): Promise<VerifiedImage | null> {
  if (!/^[\w\-/]+$/.test(publicId) || publicId.includes("..")) return null;
  if (!publicId.startsWith(`${folder}/`) || !publicId.startsWith(`${UPLOAD_FOLDER}/`)) return null;

  const sdk = getCloudinary();
  let resource;
  try {
    resource = await sdk.api.resource(publicId, { resource_type: "image", type: "upload" });
  } catch {
    return null;
  }

  const formatOk = (ALLOWED_IMAGE_FORMATS as readonly string[]).includes(resource.format);
  if (!formatOk || resource.bytes > MAX_IMAGE_BYTES) {
    await sdk.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    return null;
  }

  return {
    publicId: resource.public_id,
    format: resource.format,
    bytes: resource.bytes,
    width: resource.width,
    height: resource.height,
  };
}

/**
 * Deletes an image from Cloudinary (and purges CDN caches). Best effort: a failure is logged,
 * never thrown, because the database change it follows has already been committed.
 */
export async function deleteCloudinaryImage(publicId: string | null | undefined): Promise<boolean> {
  if (!publicId || !publicId.startsWith(`${UPLOAD_FOLDER}/`)) return false;
  try {
    const result = await getCloudinary().uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    return result.result === "ok" || result.result === "not found";
  } catch (error) {
    console.error(
      "[cloudinary] delete failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// PRIVATE files ("authenticated" assets): payment proofs and identity documents. Never
// publicly reachable; admins view them only through short-lived signed download URLs.
// ---------------------------------------------------------------------------------------

const PRIVATE_TYPE = "authenticated";

export type PrivateKind = "proofs" | "identity";

/** Allowed formats per kind. ID images are photos only; proofs may also be PDFs. */
export const PRIVATE_FORMATS: Record<PrivateKind, readonly string[]> = {
  proofs: ["jpg", "jpeg", "png", "webp", "pdf"],
  identity: ["jpg", "jpeg", "png", "webp"],
};

export const PROOF_FORMATS = PRIVATE_FORMATS.proofs;

export function privateUploadFolder(kind: PrivateKind, userId: string) {
  return `${UPLOAD_FOLDER}/${kind}/${userId}`;
}

export function proofUploadFolder(userId: string) {
  return privateUploadFolder("proofs", userId);
}

/** Signs a direct browser upload of a private file into the user's folder for that kind. */
export function createPrivateUploadSignature(
  kind: PrivateKind,
  userId: string,
): ImageUploadSignature {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const timestamp = Math.round(Date.now() / 1000);
  const allowedFormats = PRIVATE_FORMATS[kind].join(",");
  const folder = privateUploadFolder(kind, userId);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats, type: PRIVATE_TYPE },
    apiSecret,
  );
  return {
    cloudName,
    apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    timestamp,
    signature,
    folder,
    allowedFormats,
    maxFileBytes: MAX_IMAGE_BYTES,
    type: PRIVATE_TYPE,
  };
}

export function createProofUploadSignature(userId: string) {
  return createPrivateUploadSignature("proofs", userId);
}

export type VerifiedPrivateFile = { publicId: string; format: string; bytes: number };
export type VerifiedProof = VerifiedPrivateFile;

/**
 * Checks an uploaded private file before it's used: it must exist as a private asset in this
 * user's folder for this kind, have an allowed format and be at most 5 MB. Anything else is
 * deleted. Returns null if invalid.
 */
export async function verifyPrivateUpload(
  kind: PrivateKind,
  publicId: string,
  userId: string,
): Promise<VerifiedPrivateFile | null> {
  if (!/^[\w\-/]+$/.test(publicId) || publicId.includes("..")) return null;
  if (!publicId.startsWith(`${privateUploadFolder(kind, userId)}/`)) return null;

  let resource;
  try {
    resource = await getCloudinary().api.resource(publicId, {
      resource_type: "image",
      type: PRIVATE_TYPE,
    });
  } catch {
    return null;
  }
  if (!PRIVATE_FORMATS[kind].includes(resource.format) || resource.bytes > MAX_IMAGE_BYTES) {
    await deletePrivateFile(publicId);
    return null;
  }
  return { publicId: resource.public_id, format: resource.format, bytes: resource.bytes };
}

export function verifyUploadedProof(publicId: string, userId: string) {
  return verifyPrivateUpload("proofs", publicId, userId);
}

/**
 * Moves a verified private file to a new random public ID. Cloudinary's upload response gave
 * the uploader's browser a permanently signed URL for the original ID; renaming makes that URL
 * stop working, and the new ID is never sent to any browser. Returns null on failure.
 */
export async function sealPrivateFile(
  kind: PrivateKind,
  publicId: string,
  userId: string,
  label: string,
): Promise<string | null> {
  const safeLabel = label.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
  const target = `${privateUploadFolder(kind, userId)}/${safeLabel}-${randomBytes(9).toString("hex")}`;
  try {
    const result = await getCloudinary().uploader.rename(publicId, target, {
      resource_type: "image",
      type: PRIVATE_TYPE,
      to_type: PRIVATE_TYPE,
      invalidate: true,
    });
    return result.public_id ?? target;
  } catch (error) {
    console.error(
      "[cloudinary] seal failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

export function sealProof(publicId: string, userId: string, label: string) {
  return sealPrivateFile("proofs", publicId, userId, label);
}

/** A download URL for a private file, signed with the API secret and valid for a few minutes. */
export function privateDownloadUrl(
  publicId: string,
  format: string,
  {
    expiresInSeconds = 300,
    attachment = false,
  }: { expiresInSeconds?: number; attachment?: boolean } = {},
) {
  getCloudinaryEnv();
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "image",
    type: PRIVATE_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    attachment,
  });
}

export const proofDownloadUrl = privateDownloadUrl;

/** Deletes a private file. Best effort: logs (without the file id) and returns false on failure. */
export async function deletePrivateFile(publicId: string | null | undefined): Promise<boolean> {
  if (!publicId || !/^customerhowfar\/(proofs|identity)\//.test(publicId)) return false;
  try {
    const result = await getCloudinary().uploader.destroy(publicId, {
      resource_type: "image",
      type: PRIVATE_TYPE,
      invalidate: true,
    });
    return result.result === "ok" || result.result === "not found";
  } catch (error) {
    console.error(
      "[cloudinary] private delete failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

export const deleteProof = deletePrivateFile;
