import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  email: string;
  role: "admin" | "user";
};

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-secret-please-change-in-production",
  cookieName: "tcm_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getSessionData(): Promise<SessionData | null> {
  const session = await getSession();
  if (!session.email || !session.role) return null;
  return { email: session.email, role: session.role };
}
