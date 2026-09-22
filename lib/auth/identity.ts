import { getSessionData } from "./session";

export type AppIdentity = { email: string; role: "admin" | "user" };

export async function getAppIdentity(): Promise<AppIdentity | null> {
  const session = await getSessionData();
  if (!session) return null;
  return { email: session.email, role: session.role };
}

export async function requireAppIdentity(): Promise<AppIdentity | Response> {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "אין הרשאה למערכת" }, { status: 401 });
  }
  return identity;
}

export async function requireAdmin(): Promise<AppIdentity | Response> {
  const identity = await getAppIdentity();
  if (!identity) {
    return Response.json({ error: "אין הרשאה למערכת" }, { status: 401 });
  }
  if (identity.role !== "admin") {
    return Response.json({ error: "נדרשת הרשאת מנהל" }, { status: 403 });
  }
  return identity;
}
