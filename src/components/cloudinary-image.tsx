"use client";

import Image, { type ImageProps } from "next/image";
import { cloudinaryLoader } from "@/lib/images";

export type CloudinaryImageProps = Omit<ImageProps, "src" | "loader"> & {
  /** Cloudinary public ID, e.g. "customerhowfar/abc123". */
  publicId: string;
};

/**
 * next/image backed by Cloudinary: responsive srcset with f_auto and q_auto at each width.
 * Always pass `sizes` for responsive layouts so phones download small images.
 */
export function CloudinaryImage({ publicId, alt, ...props }: CloudinaryImageProps) {
  return <Image loader={cloudinaryLoader} src={publicId} alt={alt} {...props} />;
}
