// Notification categories (shared by server and client). People choose push and email per
// category on /account/notifications; in-app notifications (the bell) are always on.

export type NotificationCategoryKey =
  "LISTING" | "PAYMENT" | "REVIEW" | "RATING_REMINDER" | "STATE_LAUNCH" | "ADMIN" | "WEEKLY_STATS";

export const NOTIFICATION_CATEGORIES: {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  adminOnly?: boolean;
  /** Shown only to people who have listed a business. */
  ownerOnly?: boolean;
}[] = [
  {
    key: "LISTING",
    label: "Listing updates",
    description: "Approved, changes requested, suspended or reinstated, and ID check results.",
  },
  {
    key: "PAYMENT",
    label: "Payments",
    description: "Payment proof received, confirmed or rejected.",
  },
  {
    key: "REVIEW",
    label: "Reviews",
    description: "New reviews of your business, and replies to reviews you wrote.",
  },
  {
    key: "RATING_REMINDER",
    label: "Rating reminders",
    description: "A reminder to rate a business a few days after you contacted it.",
  },
  {
    key: "WEEKLY_STATS",
    label: "Weekly listing stats",
    description: "Every Monday: how many people viewed and contacted your business last week.",
    ownerOnly: true,
  },
  {
    key: "STATE_LAUNCH",
    label: "State launches",
    description: "When we launch in a state you're waiting for.",
  },
  {
    key: "ADMIN",
    label: "Admin alerts",
    description: "New listings to review, transfer proofs, ID checks and reports.",
    adminOnly: true,
  },
];

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
};

/** "5 min ago", "3 h ago", "2 days ago", or a date. */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(new Date(iso));
}

/** Where a notification opens: through this route, which marks it as read first. */
export const openHref = (id: string) => `/notifications/open/${id}`;
