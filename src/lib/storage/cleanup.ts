import "server-only";
import { deleteCloudinaryImage, deletePrivateFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { UPLOAD_FOLDER } from "@/config/uploads";

// Deletes Cloudinary files AFTER the database change that stopped using them has committed.
// Each file is tried a few times; anything still failing is queued and retried by the daily job.
// Logs counts only (public IDs contain user ids).

export type StoredFile = { publicId: string; private: boolean };

const ATTEMPTS = 3;

async function deleteOnce(file: StoredFile) {
  return file.private ? deletePrivateFile(file.publicId) : deleteCloudinaryImage(file.publicId);
}

async function deleteWithRetry(file: StoredFile) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (await deleteOnce(file)) return true;
    await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  return false;
}

/** Returns the number of files that couldn't be deleted now (they are queued). */
export async function deleteStoredFiles(files: StoredFile[]) {
  // Only our own folder: anything else was never ours to delete.
  const ours = files.filter((f) => f.publicId?.startsWith(`${UPLOAD_FOLDER}/`));
  const unique = [...new Map(ours.map((f) => [f.publicId, f])).values()];
  const failed: StoredFile[] = [];
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5);
    const results = await Promise.all(batch.map(deleteWithRetry));
    batch.forEach((f, j) => !results[j] && failed.push(f));
  }
  if (failed.length > 0) {
    console.error("[storage] file deletions queued for retry", { count: failed.length });
    for (const f of failed) {
      await prisma.pendingFileDeletion
        .upsert({
          where: { publicId: f.publicId },
          update: { attempts: { increment: ATTEMPTS }, lastAttemptAt: new Date() },
          create: {
            publicId: f.publicId,
            deliveryType: f.private ? "authenticated" : "upload",
            attempts: ATTEMPTS,
            lastAttemptAt: new Date(),
          },
        })
        .catch(() => console.error("[storage] could not queue a file deletion"));
    }
  }
  return failed.length;
}

/** Daily job: retries queued deletions. */
export async function processPendingFileDeletions(limit = 200) {
  const pending = await prisma.pendingFileDeletion.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let deleted = 0;
  for (const p of pending) {
    const ok = await deleteOnce({
      publicId: p.publicId,
      private: p.deliveryType === "authenticated",
    });
    if (ok) {
      await prisma.pendingFileDeletion.delete({ where: { id: p.id } });
      deleted++;
    } else {
      await prisma.pendingFileDeletion.update({
        where: { id: p.id },
        data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
      });
    }
  }
  if (pending.length > deleted) {
    console.error("[storage] queued deletions still failing", { count: pending.length - deleted });
  }
  return { queued: pending.length, deleted };
}
