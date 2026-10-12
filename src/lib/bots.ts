/** Obvious crawlers, link previewers and scripts. Not exhaustive; JS-less bots never fire beacons anyway. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|preview|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|headless|lighthouse|pingdom|uptime|monitor/i;

export function isProbablyBot(userAgent: string | null | undefined) {
  return !userAgent || userAgent.length < 10 || BOT_PATTERN.test(userAgent);
}
