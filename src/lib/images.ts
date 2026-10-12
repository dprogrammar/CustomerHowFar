// Cloudinary delivery URLs. Safe to use on the server and in the browser.

/** Sensible widths for common layouts, small enough for slow mobile networks. */
export const IMAGE_WIDTHS = {
  thumbnail: 160,
  card: 400,
  detail: 800,
  full: 1200,
} as const;

export type ImageWidth = keyof typeof IMAGE_WIDTHS | number;

export type CloudinaryUrlOptions = {
  /** Named preset or pixel width. Defaults to "card". */
  width?: ImageWidth;
  /** Optional height. With crop "fill", the image is cropped to this aspect ratio. */
  height?: number;
  /** "limit" scales down only (never up); "fill" crops to width x height around the subject. */
  crop?: "limit" | "fill";
  /** Cloudinary quality; "auto" picks the smallest size that still looks good. */
  quality?: "auto" | "auto:eco" | "auto:good" | number;
};

function getCloudName() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME environment variable.");
  }
  return cloudName;
}

function resolveWidth(width: ImageWidth) {
  return typeof width === "number" ? Math.round(width) : IMAGE_WIDTHS[width];
}

/**
 * Builds an optimized Cloudinary URL for an uploaded image's public ID, with automatic format
 * (WebP/AVIF where supported) and automatic quality.
 */
export function cloudinaryUrl(publicId: string, options: CloudinaryUrlOptions = {}) {
  const { width = "card", height, crop = "limit", quality = "auto" } = options;

  const transforms = ["f_auto", `q_${quality}`, `c_${crop}`, `w_${resolveWidth(width)}`];
  if (height) transforms.push(`h_${Math.round(height)}`);
  if (crop === "fill") transforms.push("g_auto");

  const path = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${getCloudName()}/image/upload/${transforms.join(",")}/${path}`;
}

/**
 * Loader for next/image. Cloudinary resizes and optimizes the image, so Next.js does not have
 * to. Pass a Cloudinary public ID as `src`. Use via the CloudinaryImage component.
 */
export function cloudinaryLoader({ src, width }: { src: string; width: number; quality?: number }) {
  return cloudinaryUrl(src, { width });
}
