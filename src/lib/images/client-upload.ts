// Browser-only helpers: shrink photos before upload, then upload straight to Cloudinary.

import { MAX_IMAGE_BYTES } from "@/config/uploads";

export const MAX_IMAGE_DIMENSION = 1600;
const QUALITY = 0.82;
/** Originals larger than this are refused before we even try to decode them. */
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export type PreparedImage = { blob: Blob; width: number; height: number };

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resizes to at most 1600px on the longest side and re-encodes (WebP where the browser can,
 * else JPEG/PNG). Re-encoding also strips EXIF data such as GPS location from phone photos.
 * `keepTransparency` keeps PNG-style transparency for logos.
 */
export async function prepareImage(
  file: File,
  { keepTransparency = false }: { keepTransparency?: boolean } = {},
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo (JPG, PNG or WebP).");
  if (file.size > MAX_INPUT_BYTES)
    throw new Error("This photo is too large. Please choose a smaller one.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format isn't supported. Please choose a JPG, PNG or WebP photo.");
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this photo.");
  if (!keepTransparency) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, "image/webp", QUALITY);
  // Some browsers (older Safari) silently return PNG when WebP isn't supported.
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, keepTransparency ? "image/png" : "image/jpeg", QUALITY);
  }
  if (!blob) throw new Error("Your browser couldn't process this photo.");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("This photo is still over 5 MB after resizing.");
  return { blob, width, height };
}

type Signature = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  type?: string;
};

/** Signing endpoints: public listing photos, or private payment proofs. */
export type UploadKind = "photo" | "proof";
const SIGN_ENDPOINTS: Record<UploadKind, string> = {
  photo: "/api/uploads/sign",
  proof: "/api/uploads/sign-proof",
};

const cachedSignatures = new Map<UploadKind, { value: Signature; fetchedAt: number }>();
const SIGNATURE_REUSE_MS = 45 * 60 * 1000; // Signatures are valid for 60 minutes.

async function getSignature(kind: UploadKind): Promise<Signature> {
  const cached = cachedSignatures.get(kind);
  if (cached && Date.now() - cached.fetchedAt < SIGNATURE_REUSE_MS) return cached.value;
  const res = await fetch(SIGN_ENDPOINTS[kind], { method: "POST" });
  if (res.status === 401) throw new Error("Your session has expired. Please log in again.");
  if (!res.ok) throw new Error("Uploads are unavailable right now. Please try again shortly.");
  const value = (await res.json()) as Signature;
  cachedSignatures.set(kind, { value, fetchedAt: Date.now() });
  return value;
}

export type UploadedImage = { publicId: string; width: number; height: number; format?: string };

/** Uploads to Cloudinary with progress (0-100). XHR is used because fetch has no upload progress. */
export async function uploadToCloudinary(
  blob: Blob,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  kind: UploadKind = "photo",
): Promise<UploadedImage> {
  const sig = await getSignature(kind);
  const form = new FormData();
  form.append("file", blob);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  form.append("allowed_formats", sig.allowedFormats);
  if (sig.type) form.append("type", sig.type);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sig.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let body: {
        public_id?: string;
        width?: number;
        height?: number;
        format?: string;
        error?: { message?: string };
      };
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.public_id) {
        resolve({
          publicId: body.public_id,
          width: body.width ?? 0,
          height: body.height ?? 0,
          format: body.format,
        });
      } else if (xhr.status === 400 && /format/i.test(body.error?.message ?? "")) {
        reject(new Error("That file type isn't allowed. Please upload a JPG, PNG, WebP or PDF."));
      } else {
        if (xhr.status === 401) cachedSignatures.delete(kind); // Expired signature: refetch next time.
        reject(new Error("Upload failed. Check your connection and try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Check your connection and try again."));
    xhr.timeout = 5 * 60 * 1000;
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
