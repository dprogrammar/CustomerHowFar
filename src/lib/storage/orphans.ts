import "server-only";
import { getCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { UPLOAD_FOLDER } from "@/config/uploads";

// Deletes Cloudinary files in our upload folders that no database record points to (abandoned
// wizard uploads, replaced photos whose delete failed, uploads never submitted). Safety rules:
// - only our three folders; only files older than the minimum age (24 hours by default), so
//   uploads still in progress are never touched;
// - every candidate is checked against the database right before deletion;
// - small batches and a cap per run; dry-run mode reports without deleting.
// Logs counts only (file ids contain user ids).

const FOLDERS = [
  { prefix: `${UPLOAD_FOLDER}/users/`, type: "upload" },
  { prefix: `${UPLOAD_FOLDER}/proofs/`, type: "authenticated" },
  { prefix: `${UPLOAD_FOLDER}/identity/`, type: "authenticated" },
] as const;

const PAGE_SIZE = 100;
const MAX_PAGES_PER_FOLDER = 20;
const DELETE_BATCH = 50;

export type OrphanCleanupOptions = {
  dryRun?: boolean;
  /** Files younger than this are never touched. Default 24 hours. */
  minAgeMinutes?: number;
  /** Limit the run to one sub-folder, e.g. "customerhowfar/users/<userId>/". */
  prefix?: string;
  /** At most this many deletions per run. */
  maxDeletes?: number;
};

export type OrphanCleanupResult = {
  dryRun: boolean;
  scanned: number;
  referenced: number;
  tooNew: number;
  orphans: number;
  deleted: number;
  failed: number;
};

/** Of the given public ids, the ones any database record still uses. */
async function referencedIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT logo_public_id AS id FROM businesses WHERE logo_public_id = ANY(${ids})
    UNION SELECT cover_public_id FROM businesses WHERE cover_public_id = ANY(${ids})
    UNION SELECT public_id FROM business_photos WHERE public_id = ANY(${ids})
    UNION SELECT proof_public_id FROM payments WHERE proof_public_id = ANY(${ids})
    UNION SELECT id_front_public_id FROM identity_verifications WHERE id_front_public_id = ANY(${ids})
    UNION SELECT id_back_public_id FROM identity_verifications WHERE id_back_public_id = ANY(${ids})
    UNION SELECT selfie_public_id FROM identity_verifications WHERE selfie_public_id = ANY(${ids})`;
  return new Set(rows.map((r) => r.id));
}

type Resource = { public_id: string; created_at: string };

export async function cleanOrphanedUploads(
  options: OrphanCleanupOptions = {},
): Promise<OrphanCleanupResult> {
  const dryRun = options.dryRun ?? false;
  const minAgeMinutes = Math.max(0, options.minAgeMinutes ?? 24 * 60);
  const maxDeletes = options.maxDeletes ?? 500;
  const cutoff = Date.now() - minAgeMinutes * 60 * 1000;
  const result: OrphanCleanupResult = {
    dryRun,
    scanned: 0,
    referenced: 0,
    tooNew: 0,
    orphans: 0,
    deleted: 0,
    failed: 0,
  };
  const cloudinary = getCloudinary();

  for (const folder of FOLDERS) {
    let prefix: string = folder.prefix;
    if (options.prefix) {
      if (!options.prefix.startsWith(folder.prefix)) continue;
      prefix = options.prefix;
    }
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_FOLDER; page++) {
      const res = (await cloudinary.api.resources({
        type: folder.type,
        resource_type: "image",
        prefix,
        max_results: PAGE_SIZE,
        ...(cursor ? { next_cursor: cursor } : {}),
      })) as { resources: Resource[]; next_cursor?: string };
      const resources = res.resources ?? [];
      result.scanned += resources.length;

      const old = resources.filter((r) => new Date(r.created_at).getTime() < cutoff);
      result.tooNew += resources.length - old.length;
      const used = await referencedIds(old.map((r) => r.public_id));
      result.referenced += old.filter((r) => used.has(r.public_id)).length;
      const orphans = old.map((r) => r.public_id).filter((id) => !used.has(id));
      result.orphans += orphans.length;

      if (!dryRun) {
        for (let i = 0; i < orphans.length && result.deleted < maxDeletes; i += DELETE_BATCH) {
          const batch = orphans.slice(i, i + DELETE_BATCH).slice(0, maxDeletes - result.deleted);
          // Re-check right before deleting, in case a record started using a file meanwhile.
          const nowUsed = await referencedIds(batch);
          const safe = batch.filter((id) => !nowUsed.has(id));
          if (safe.length === 0) continue;
          try {
            const del = (await cloudinary.api.delete_resources(safe, {
              type: folder.type,
              resource_type: "image",
              invalidate: true,
            })) as { deleted?: Record<string, string> };
            const states = Object.values(del.deleted ?? {});
            const ok = states.filter((s) => s === "deleted" || s === "not_found").length;
            result.deleted += ok;
            result.failed += safe.length - ok;
          } catch {
            result.failed += safe.length;
          }
        }
      }

      cursor = res.next_cursor;
      if (!cursor) break;
    }
  }

  console.info("[storage] orphan cleanup", result);
  return result;
}
