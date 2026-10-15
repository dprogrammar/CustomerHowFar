// Friendly stats messages for business owners (shared by the dashboard and the weekly summary).

const times = (n: number) => `${n.toLocaleString("en-NG")} ${n === 1 ? "time" : "times"}`;
const people = (n: number) => `${n.toLocaleString("en-NG")} ${n === 1 ? "person" : "people"}`;

/** e.g. "Your listing was viewed 120 times this week and 15 people contacted you." */
export function ownerStatsMessage(views: number, contacts: number, period = "this week") {
  if (views === 0 && contacts === 0)
    return `No views yet ${period}. Share your listing link on WhatsApp to bring in your first customers.`;
  if (contacts === 0)
    return `Your listing was viewed ${times(views)} ${period}. Clear photos of your work help turn views into customers.`;
  return `Your listing was viewed ${times(views)} ${period} and ${people(contacts)} contacted you. Well done!`;
}
