import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  // Wait for a real request: never prerender or cache this route.
  await connection();

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { id: 1 },
      select: { paymentRequired: true },
    });
    if (!setting) {
      throw new Error("AppSetting row is missing; run npm run db:seed.");
    }

    return Response.json(
      { status: "ok", database: "connected", paymentRequired: setting.paymentRequired },
      { headers: NO_STORE },
    );
  } catch (error) {
    // Log only the error type and message server-side; never return details to the client.
    console.error(
      "[health] database check failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown error",
    );
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
