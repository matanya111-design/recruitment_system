import { getDb } from "@/db/client";
import { getAppIdentity } from "@/lib/auth/identity";
import { errorLogs } from "@/db/schema";

// Fire-and-forget sink for runtime errors (client render crashes, caught server exceptions).
// No auth requirement — a crash can happen before/without a valid session, and losing that
// error would defeat the point of the log.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { message?: string; stack?: string; url?: string; source?: string; context?: unknown }
    | null;
  if (!body?.message) return Response.json({ error: "חסרה הודעת שגיאה" }, { status: 400 });

  const identity = await getAppIdentity().catch(() => null);
  const db = getDb();
  await db.insert(errorLogs).values({
    source: body.source === "server" ? "server" : "client",
    message: String(body.message).slice(0, 4000),
    stack: body.stack ? String(body.stack).slice(0, 8000) : null,
    url: body.url ? String(body.url).slice(0, 2000) : null,
    actorEmail: identity?.email ?? null,
    context: body.context ?? null,
  });

  return Response.json({ ok: true });
}
