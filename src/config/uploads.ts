// Upload rules shared by the server (signing, verification) and the browser (pre-upload checks).

/** Cloudinary folder every upload is restricted to. */
export const UPLOAD_FOLDER = "customerhowfar";

/** Image formats Cloudinary will accept. Enforced by the signed `allowed_formats` param. */
export const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;

/** MIME types matching ALLOWED_IMAGE_FORMATS, for the browser file picker and pre-checks. */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Maximum upload size: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
