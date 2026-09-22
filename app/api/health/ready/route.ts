import { getDb } from "@/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: "ok", db: "connected" });
  } catch (error) {
    return Response.json({ status: "error", db: error instanceof Error ? error.message : "unavailable" }, { status: 503 });
  }
}
