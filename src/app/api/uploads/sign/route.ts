import { createImageUploadSignature } from "@/lib/cloudinary";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Returns a short-lived signature for a direct browser-to-Cloudinary image upload.
 * The API secret never leaves the server. POST so the response is never cached or prefetched.
 */
export async function POST() {
  // TODO(auth): Require a signed-in user once login is built (e.g. check the Supabase session
  // via createClient() from "@/lib/supabase/server" and return 401 if absent), and add rate
  // limiting per user/IP. Until then anyone can request a signature for the upload folder.

  try {
    return Response.json(createImageUploadSignature(), { headers: NO_STORE });
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
