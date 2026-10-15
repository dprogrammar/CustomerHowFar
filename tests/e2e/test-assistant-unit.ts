import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
require("./scripts/env-guard.mjs").loadEnv(); // refuses production

// [message, expected]: FAQ slug, "STATUS", "FIND", "SMALL:<kind>", "SEARCH:<category>[@state[/lga]]", "VAGUE@state", or null (fallback)
const CASES: [string, string | null][] = [
  ["How do I list my business?", "how-to-list"],
  ["how i go take list my shop", "how-to-list"],
  ["abeg how I go list my shop for here", "how-to-list"],
  ["how do i register my busines", "how-to-list"],
  ["i wan advertise my business", "how-to-list"],
  ["wetin be id submitted", "id-submitted"],
  ["what does ID submitted mean", "id-submitted"],
  ["is this business legit", "id-submitted"],
  ["how much is the lisitng fee", "FEE:listing-fee|free-to-list"],
  ["how much e cost to list", "FEE:listing-fee|free-to-list"],
  ["na how much una dey collect", "FEE:listing-fee|free-to-list"],
  ["is listing free", "FEE:listing-fee|free-to-list"],
  ["can i list for free", "FEE:listing-fee|free-to-list"],
  ["how to pay for listing", "FEE:listing-fee|free-to-list"],
  ["which states una dey", "which-states"],
  ["are you in abuja", "which-states"],
  ["una dey port harcourt?", "which-states"],
  ["how do I stay safe", "stay-safe"],
  ["how to avoid scam", "stay-safe"],
  ["should i pay upfront", "paying-safely"],
  ["i forgot my pasword", "forgot-password"],
  ["how do i delete my acount", "delete-account"],
  ["can i talk to a human", "contact-us"],
  ["customer care number", "contact-us"],
  ["why was my listing rejected", "rejected"],
  ["how long does approval take", "review-process"],
  ["how una dey take check the business", "review-process"],
  ["how do i reply to a review", "reply-reviews"],
  ["how do reviews work", "reviews-help"],
  ["how do i report a scammer", "report-a-problem"],
  ["why do you need my NIN", "id-check"],
  ["how do i change my phone number on my listing", "edit-delete"],
  ["is it free for customers", "free-for-customers"],
  ["how do i contact a business", "contact-business"],
  ["the guy ran away with my money", "something-wrong"],
  ["wetin i go do if dem scam me", "something-wrong|report-a-problem"],
  ["how do i become a vendor", "how-to-list"],
  ["do you have an app", "app"],
  ["is my data safe", "data-privacy"],
  ["how do i upload photos", "photos"],
  ["what is the capital of france", null],
  ["asdfgh qwerty", null],
  ["do you sell cars", null],
  ["what time do you close", null],
  ["who una be", null],
  ["how far", "SMALL:greeting"],
  ["How far!", "SMALL:greeting"],
  ["abeg thank you", "SMALL:thanks"],
  ["my listing never show", "STATUS"],
  ["has my business been approved?", "STATUS"],
  ["my listing status", "STATUS"],
  ["find a business", "FIND"],
  ["I need a plumber in Lekki", "SEARCH:plumbers@lagos/eti-osa"],
  ["tailor for Ikeja", "SEARCH:fashion-tailoring@lagos/ikeja"],
  ["who fit fix my AC", "SEARCH:ac-fridge-repair"],
  ["abeg I need vulcanizer for Surulere", "SEARCH:mechanics@lagos/surulere"],
  ["fashion designer in yaba", "SEARCH:fashion-tailoring@lagos/lagos-mainland"],
  ["makeup artist in Abuja", "SEARCH:makeup-artists@fct"],
  ["I need electrician for port harcourt", "SEARCH:electricians@rivers/port-harcourt"],
  ["plumber", "SEARCH:plumbers"],
  ["any good barber around ajah", "SEARCH:barbers@lagos/eti-osa"],
  ["looking for a caterer in Kano state", "SEARCH:caterers-food@kano"],
  ["generator repairer in delta", "SEARCH:generator-repair@delta"],
  ["I need someone in Lekki", "VAGUE@lagos"],
  ["how do I list my tailoring business", "how-to-list"],
  ["is there a fee to list my business", "FEE:listing-fee|free-to-list"],
  ["how do I pay for my listing", "FEE:listing-fee|free-to-list"],
  ["bank transfer details for listing", "FEE:listing-fee|free-to-list"],
  ["how much does it cost to list my shop", "FEE:listing-fee|free-to-list"],
  ["what is the price to advertise my business", "FEE:listing-fee|free-to-list"],
  ["refund for listing fee", "FEE:listing-fee|free-to-list"],
  ["how much is the fee to list my plumbing business", "FEE:listing-fee|free-to-list"],
];

async function main() {
  const U = await import(
    require("node:url").pathToFileURL(process.cwd() + "/src/lib/assistant/understand.ts").href
  );
  const { matchFaqs, ANSWER_MIN_SCORE } = await import(
    require("node:url").pathToFileURL(process.cwd() + "/src/lib/assistant/match.ts").href
  );
  const { prisma } = await import(
    require("node:url").pathToFileURL(process.cwd() + "/src/lib/prisma.ts").href
  );
  const categories = await prisma.category.findMany({
    where: { isActive: true, parentId: null },
    select: { slug: true, name: true },
  });
  const states = await prisma.state.findMany({
    select: { id: true, slug: true, name: true, isActive: true },
  });
  const lgaRows = await prisma.lga.findMany({ select: { stateId: true, slug: true, name: true } });
  const lgas: Record<number, { slug: string; name: string }[]> = {};
  for (const l of lgaRows) (lgas[l.stateId] ??= []).push({ slug: l.slug, name: l.name });

  let ok = 0;
  let total = 0;
  for (const feeOn of [false, true]) {
    console.log(`--- listing fee ${feeOn ? "ON" : "OFF"}`);
    for (const [msg, rawWant] of CASES) {
      // "FEE:<on>|<off>": the expected answer depends on the fee switch.
      const want = rawWant?.startsWith("FEE:")
        ? rawWant.slice(4).split("|")[feeOn ? 0 : 1]
        : rawWant;
      if (!feeOn && !rawWant?.startsWith("FEE:")) {
        /* run every case with the fee off */
      } else if (feeOn && !rawWant?.startsWith("FEE:")) continue;
      total++;
      const u = U.understand(msg);
      let got: string | null;
      let detail = "";
      const small = U.detectSmallTalk(u);
      if (small) got = `SMALL:${small}`;
      else if (U.isStatusRequest(u)) got = "STATUS";
      else if (U.isFindRequest(u)) got = "FIND";
      else {
        const c = U.detectCategory(u, categories);
        const loc = U.detectLocation(u, states, lgas);
        if (c && U.isServiceRequest(u, c, loc))
          got = `SEARCH:${c.slug}${loc ? `@${loc.state.slug}${loc.lga ? `/${loc.lga.slug}` : ""}` : ""}`;
        else if (!c && U.isVagueServiceRequest(u, loc)) got = `VAGUE@${loc!.state.slug}`;
        else if (U.isCostQuestion(u)) got = feeOn ? "listing-fee" : "free-to-list";
        else {
          const hits = await matchFaqs(u, feeOn);
          got = hits[0] && hits[0].score >= ANSWER_MIN_SCORE ? hits[0].slug : null;
          detail = hits
            .slice(0, 3)
            .map((h: { slug: string; score: number }) => `${h.slug}:${h.score.toFixed(2)}`)
            .join(" ");
        }
      }
      const pass = want === null ? got === null : want.split("|").includes(String(got));
      if (pass) ok++;
      console.log(
        `${pass ? "ok  " : "MISS"} ${msg.padEnd(50)} -> ${String(got).padEnd(34)} ${detail} | ${u.plain}`,
      );
    }
  }
  console.log(`${ok}/${total}`);
  process.exit(ok === total ? 0 : 1);
}
main();
