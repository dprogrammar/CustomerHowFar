// Which copy of the site this is. Vercel sets VERCEL_ENV: "production" for the live site (main
// branch, www.customerhowfar.com.ng) and "preview" for the staging site (staging branch,
// staging.customerhowfar.com.ng, dev database) and any other branch deploy. Unset locally.
//
// The staging site: shows a TEST SITE banner, is never indexed, sends no push notifications,
// runs no cron job, and its emails say [TEST] and never go to reserved test domains.

/** The live site (Vercel production deployment). */
export const isProductionSite = () => process.env.VERCEL_ENV === "production";

/** The staging site (or another Vercel preview deployment), on the dev database. */
export const isStagingSite = () => process.env.VERCEL_ENV === "preview";
