import { getSessionUser } from "@/lib/auth/session";
import { createImageUploadSignature } from "@/lib/cloudinary";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Returns a short-lived signature for a direct browser-to-Cloudinary image upload.
 * Requires a signed-in user. The API secret never leaves the server. POST so the response is
 * never cached or prefetched.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Please log in to upload images." },
      { status: 401, headers: NO_STORE },
    );
  }
  // TODO(rate-limit): limit signatures per user before opening uploads to everyone.

  try {
    return Response.json(createImageUploadSignature(user.id), { headers: NO_STORE });
  } catch (error) {
    console.error(
      "[uploads/sign] failed to create signature:",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      { error: "Upload signing unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }
}
