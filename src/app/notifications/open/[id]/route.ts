import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Opening a notification (from the bell, /notifications or a push notification): marks it as
// read, then goes to its page. Only the signed-in owner of the notification can open it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, ctx: RouteContext<"/notifications/open/[id]">) {
  const { id } = await ctx.params;
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const user = await getSessionUser();
  if (!user) return go(`/login?next=${encodeURIComponent(`/notifications/open/${id}`)}`);
  if (!UUID.test(id)) return go("/notifications");
  const n = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { link: true, readAt: true },
  });
  if (!n) return go("/notifications");
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  const safe = n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifications";
  return go(safe);
}
