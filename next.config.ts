import type { NextConfig } from "next";

const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Only allow images from this project's own Cloudinary account.
    remotePatterns: cloudinaryCloudName
      ? [new URL(`https://res.cloudinary.com/${cloudinaryCloudName}/**`)]
      : [],
    // Cap responsive widths: phones never need more than ~1920px.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
