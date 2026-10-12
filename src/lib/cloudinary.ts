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
// Payment proofs: PRIVATE ("authenticated") assets. Never publicly reachable; admins view
// them only through short-lived signed download URLs (see proofDownloadUrl).
// ---------------------------------------------------------------------------------------

export const PROOF_FORMATS = ["jpg", "jpeg", "png", "webp", "pdf"] as const;
const PROOF_TYPE = "authenticated";

export function proofUploadFolder(userId: string) {
  return `${UPLOAD_FOLDER}/proofs/${userId}`;
}

/** Signs a direct browser upload of a payment proof into the user's private proof folder. */
export function createProofUploadSignature(userId: string): ImageUploadSignature {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const timestamp = Math.round(Date.now() / 1000);
  const allowedFormats = PROOF_FORMATS.join(",");
  const folder = proofUploadFolder(userId);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats, type: PROOF_TYPE },
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
    type: PROOF_TYPE,
  };
}

export type VerifiedProof = { publicId: string; format: string; bytes: number };

/**
 * Checks an uploaded proof before it's attached to a payment: it must exist as a private
 * asset in this user's proof folder, be jpg/png/webp/pdf and at most 5 MB. Anything else is
 * deleted. Returns null if invalid.
 */
export async function verifyUploadedProof(
  publicId: string,
  userId: string,
): Promise<VerifiedProof | null> {
  if (!/^[\w\-/]+$/.test(publicId) || publicId.includes("..")) return null;
  if (!publicId.startsWith(`${proofUploadFolder(userId)}/`)) return null;

  const sdk = getCloudinary();
  let resource;
  try {
    resource = await sdk.api.resource(publicId, { resource_type: "image", type: PROOF_TYPE });
  } catch {
    return null;
  }
  const formatOk = (PROOF_FORMATS as readonly string[]).includes(resource.format);
  if (!formatOk || resource.bytes > MAX_IMAGE_BYTES) {
    await deleteProof(publicId);
    return null;
  }
  return { publicId: resource.public_id, format: resource.format, bytes: resource.bytes };
}

/**
 * Moves a verified proof to a new random public ID. Cloudinary's upload response gave the
 * uploader's browser a permanently signed URL for the original ID; renaming makes that URL
 * stop working, and the new ID is never sent to any browser. From then on the file can only
 * be viewed through proofDownloadUrl (admins, 5-minute links). Returns null on failure.
 */
export async function sealProof(
  publicId: string,
  userId: string,
  label: string,
): Promise<string | null> {
  const safeLabel = label.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
  const target = `${proofUploadFolder(userId)}/${safeLabel}-${randomBytes(9).toString("hex")}`;
  try {
    const result = await getCloudinary().uploader.rename(publicId, target, {
      resource_type: "image",
      type: PROOF_TYPE,
      to_type: PROOF_TYPE,
      invalidate: true,
    });
    return result.public_id ?? target;
  } catch (error) {
    console.error(
      "[cloudinary] proof seal failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

/** A download URL for a private proof, signed with the API secret and valid for a few minutes. */
export function proofDownloadUrl(
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
    type: PROOF_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    attachment,
  });
}

export async function deleteProof(publicId: string | null | undefined) {
  if (!publicId || !publicId.startsWith(`${UPLOAD_FOLDER}/proofs/`)) return false;
  try {
    const result = await getCloudinary().uploader.destroy(publicId, {
      resource_type: "image",
      type: PROOF_TYPE,
      invalidate: true,
    });
    return result.result === "ok" || result.result === "not found";
  } catch (error) {
    console.error(
      "[cloudinary] proof delete failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}
