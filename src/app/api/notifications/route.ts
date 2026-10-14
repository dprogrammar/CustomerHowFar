import { getSessionUser } from "@/lib/auth/session";
import { listNotifications, unreadCount } from "@/lib/notifications/server";

// The header bell: unread count, plus the latest notifications when ?list=1. Signed-in user only;
// never cached.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ signedIn: false, unread: 0, items: [] }, { headers: NO_STORE });
  const withList = new URL(request.url).searchParams.get("list") === "1";
  const [unread, items] = await Promise.all([
    unreadCount(user.id),
    withList ? listNotifications(user.id, { take: 8 }) : Promise.resolve([]),
  ]);
  return Response.json({ signedIn: true, unread, items }, { headers: NO_STORE });
}
