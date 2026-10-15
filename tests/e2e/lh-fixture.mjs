// Creates (or removes) a test owner + approved business with real photos, used only for the
// Lighthouse business-page audit. Usage: node lh-fixture.mjs <projectDir> create|delete
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath, outputFile } from "./lib/setup.mjs";

const [projectDir, mode] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const CLD = process.env.CLOUDINARY_FOLDER || "customerhowfar"; // dev: dev/customerhowfar
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
const stateFile = outputFile("lh-fixture.json");

if (mode === "create") {
  const run = crypto.randomBytes(3).toString("hex");
  const email = `chf-e2e-${run}-lh@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Tst-${crypto.randomBytes(9).toString("base64url")}9a`,
    email_confirm: true,
    user_metadata: { full_name: "Lara Lighthouse" },
  });
  if (error) throw new Error(error.code);
  const uid = data.user.id;
  await db.query(
    "insert into profiles (id, full_name, email, role, updated_at) values ($1,'Lara Lighthouse',$2,'BUSINESS_OWNER', now())",
    [uid, email],
  );
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
  const page = await browser.newPage();
  const uris = await page.evaluate(() =>
    ["#7a4a2a", "#2f6d4f", "#355c9a", "#8a2d5a", "#b06a1f"].map((color, i) => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 1067;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 1600, 1067);
      g.addColorStop(0, color);
      g.addColorStop(1, "#f2e6d0");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1600, 1067);
      for (let k = 0; k < 400; k++) {
        ctx.fillStyle = `hsla(${(k * 37) % 360},60%,50%,0.15)`;
        ctx.beginPath();
        ctx.arc((k * 97) % 1600, (k * 61) % 1067, 20 + (k % 40), 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(`Work photo ${i + 1}`, 120, 540);
      return c.toDataURL("image/jpeg", 0.85);
    }),
  );
  await browser.close();
  const ids = [];
  for (const u of uris)
    ids.push((await cloudinary.uploader.upload(u, { folder: `${CLD}/users/${uid}` })).public_id);
  const cat = (await db.query("select id from categories where slug = 'fashion-tailoring'")).rows[0]
    .id;
  const st = (await db.query("select id from states where slug = 'lagos'")).rows[0].id;
  const lga = (await db.query("select id from lgas where state_id = $1 and slug = 'ikeja'", [st]))
    .rows[0].id;
  const bid = crypto.randomUUID();
  const slug = `e2e-lh-${run}-tailors`;
  const hours = JSON.stringify(
    Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { open: "08:00", close: "18:00" }]),
    ),
  );
  await db.query(
    `insert into businesses (id, owner_id, name, slug, category_id, tagline, description, services, phone, whatsapp_number, address, area, state_id, lga_id, status, logo_public_id, cover_public_id, opening_hours, years_of_experience, submitted_at, published_at, updated_at)
     values ($1,$2,'E2E Lighthouse Tailors',$3,$4,'Bespoke native wear and alterations','We make bespoke native wear, wedding outfits and alterations for men and women. Quality fabric advice, fast turnaround and neat finishing.', $5, '+2348039990001','+2348039990001','12 Test Avenue','Allen Avenue',$6,$7,'APPROVED',$8,$9,$10,8, now(), now(), now())`,
    [
      bid,
      uid,
      slug,
      cat,
      ["Agbada", "Kaftan", "Wedding outfits", "Alterations"],
      st,
      lga,
      ids[0],
      ids[1],
      hours,
    ],
  );
  for (const [i, pid] of ids.slice(1).entries()) {
    await db.query(
      "insert into business_photos (id, business_id, public_id, width, height, sort_order, updated_at) values (gen_random_uuid(), $1, $2, 1600, 1067, $3, now())",
      [bid, pid, i],
    );
  }
  fs.writeFileSync(stateFile, JSON.stringify({ uid, slug }));
  console.log("fixture created");
} else {
  const { uid } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  await db.query("delete from businesses where owner_id = $1", [uid]);
  await db.query("delete from profiles where id = $1", [uid]);
  const r = await cloudinary.api.delete_resources_by_prefix(`${CLD}/users/${uid}/`);
  await admin.auth.admin.deleteUser(uid);
  fs.unlinkSync(stateFile);
  console.log("fixture removed; files:", Object.keys(r.deleted ?? {}).length);
}
await db.end();
