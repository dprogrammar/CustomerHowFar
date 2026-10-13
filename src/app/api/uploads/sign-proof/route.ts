import { getSessionUser } from "@/lib/auth/session";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { createProofUploadSignature } from "@/lib/cloudinary";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Signs a direct upload of a payment proof (image or PDF) as a PRIVATE Cloudinary asset in
 * the signed-in user's proof folder. The file is verified again on the server before use.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Please log in to upload." }, { status: 401, headers: NO_STORE });
  }
  const limited = await rateLimit("upload-sign", user.id);
  if (!limited.ok) {
    return Response.json({ error: tooManyMessage(limited) }, { status: 429, headers: NO_STORE });
  }
  try {
    return Response.json(createProofUploadSignature(user.id), { headers: NO_STORE });
  } catch (error) {
    console.error(
      "[uploads/sign-proof] failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      { error: "Upload signing unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }
}
