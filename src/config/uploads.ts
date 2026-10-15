// Upload rules shared by the server (signing, verification) and the browser (pre-upload checks).

/**
 * Cloudinary folder every upload is restricted to (server only). Production uses
 * "customerhowfar"; development sets CLOUDINARY_FOLDER=dev/customerhowfar so test images never
 * mix with real ones, and the orphan clean-up in dev can never see (or delete) real files.
 */
export const UPLOAD_FOLDER = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(process.env.CLOUDINARY_FOLDER ?? "")
  ? process.env.CLOUDINARY_FOLDER!
  : "customerhowfar";

/** Image formats Cloudinary will accept. Enforced by the signed `allowed_formats` param. */
export const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;

/** MIME types matching ALLOWED_IMAGE_FORMATS, for the browser file picker and pre-checks. */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Maximum upload size: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
