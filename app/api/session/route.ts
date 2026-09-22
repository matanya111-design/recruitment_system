import { getDb } from "@/db/client";
import { appUsers } from "@/db/schema";
import { bootstrap } from "@/lib/auth/bootstrap";
import { getSessionData } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function GET() {
  await bootstrap();

  const session = await getSessionData();
  if (!session) {
    return Response.json({
      email: "",
      name: "",
      isAuthenticated: false,
      isAllowed: false,
      isAdmin: false,
    });
  }

  const db = getDb();
  const user = await db.query.appUsers.findFirst({
    where: eq(appUsers.email, session.email),
  });

  if (!user) {
    return Response.json({
      email: session.email,
      name: session.email,
      isAuthenticated: true,
      isAllowed: false,
      isAdmin: false,
    });
  }

  return Response.json({
    email: user.email,
    name: user.email,
    isAuthenticated: true,
    isAllowed: true,
    isAdmin: user.role === "admin",
  });
}
