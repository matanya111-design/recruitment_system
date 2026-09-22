import { getDb } from "@/db/client";
import { appUsers } from "@/db/schema";
import { bootstrap } from "@/lib/auth/bootstrap";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("כתובת מייל לא תקינה").toLowerCase().trim(),
});

export async function POST(request: Request) {
  await bootstrap();

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "כתובת מייל לא תקינה" }, { status: 400 });
  }

  const { email } = parsed.data;
  const db = getDb();
  let user = await db.query.appUsers.findFirst({
    where: eq(appUsers.email, email),
  });

  // Auto-provision owner on first login if bootstrap hasn't run yet
  if (!user && email === (process.env.APP_OWNER_EMAIL ?? "").toLowerCase().trim()) {
    await db.insert(appUsers).values({ email, role: "admin" }).onConflictDoNothing();
    user = await db.query.appUsers.findFirst({ where: eq(appUsers.email, email) });
  }

  if (!user) {
    return Response.json(
      { error: "החשבון אינו מורשה למערכת. פנה למנהל המערכת." },
      { status: 403 },
    );
  }

  const session = await getSession();
  session.email = user.email;
  session.role = user.role as "admin" | "user";
  await session.save();

  return Response.json({ ok: true, isAdmin: user.role === "admin" });
}
