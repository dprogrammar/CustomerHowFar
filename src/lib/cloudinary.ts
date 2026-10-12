import "server-only";
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
