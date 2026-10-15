// Removes ALL leftover e2e test data (users with emails starting "chf-e2e-") and makes sure
// the listing-fee switch is OFF. Prints counts only.
import { createRequire } from "node:module";
import path from "node:path";

const projectDir = process.argv[2];
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const CLD = process.env.CLOUDINARY_FOLDER || "customerhowfar"; // dev: dev/customerhowfar
const pg = require("pg");
const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
const ids = (await db.query("select id from profiles where email like 'chf-e2e-%'")).rows.map(
  (r) => r.id,
);
let images = 0;
for (const id of ids) {
  const res = await cloudinary.api.delete_resources_by_prefix(`${CLD}/users/${id}/`);
  images += Object.keys(res.deleted ?? {}).length;
  const proofs = await cloudinary.api.delete_resources_by_prefix(`${CLD}/proofs/${id}/`, {
    type: "authenticated",
  });
  images += Object.keys(proofs.deleted ?? {}).length;
  const idImages = await cloudinary.api.delete_resources_by_prefix(`${CLD}/identity/${id}/`, {
    type: "authenticated",
  });
  images += Object.keys(idImages.deleted ?? {}).length;
}
console.log("test images deleted:", images);
const run = async (label, sql) => console.log(label, (await db.query(sql, [ids])).rowCount);
await run(
  "audit entries deleted:",
  "delete from admin_audit_log where target_user_id = any($1::uuid[]) or actor_id = any($1::uuid[])",
);
await run(
  "identity checks deleted:",
  "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[])",
);
await run(
  "payments deleted:",
  "delete from payments where user_id = any($1::uuid[]) or business_id in (select id from businesses where owner_id = any($1::uuid[]))",
);
await run("businesses deleted:", "delete from businesses where owner_id = any($1::uuid[])");
await run(
  "setting changes deleted:",
  "delete from setting_changes where admin_id = any($1::uuid[])",
);
await run("profiles deleted:", "delete from profiles where id = any($1::uuid[])");
const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
const stray = (data?.users ?? []).filter((u) => u.email?.startsWith("chf-e2e-"));
for (const u of stray) await admin.auth.admin.deleteUser(u.id);
console.log("auth users deleted:", stray.length);
await db.query("update app_settings set payment_required = false where id = 1");
const s = (
  await db.query("select payment_required, listing_fee_naira from app_settings where id = 1")
).rows[0];
console.log("payment_required:", s.payment_required, "| fee:", s.listing_fee_naira);
await db.end();
