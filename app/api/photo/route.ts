import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { uploadObject, getPresignedUrl, deleteObject } from "@/lib/storage/client";
import { candidates } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Shared photo upload/fetch/delete for candidates and team members. `candidates` has real Drizzle
// columns; `team_members` is a dynamically-migrated table (see lib/team/ensure-table.ts), so it's
// read/written with raw SQL here — same split the rest of the codebase already uses.

const MAX_FILE_SIZE = 5 * 1024 * 1024;
type Entity = "candidate" | "team";
type Db = ReturnType<typeof getDb>;

function parseEntity(value: FormDataEntryValue | string | null): Entity | null {
  return value === "candidate" || value === "team" ? value : null;
}

async function getPhotoKey(db: Db, entity: Entity, id: number): Promise<string | null> {
  if (entity === "candidate") {
    const [row] = await db.select({ photoKey: candidates.photoKey }).from(candidates).where(eq(candidates.id, id));
    return row?.photoKey ?? null;
  }
  const result = await db.execute(sql`SELECT photo_key FROM team_members WHERE id=${id}`);
  const row = (result as unknown as { rows: Array<{ photo_key: string | null }> }).rows[0];
  return row?.photo_key ?? null;
}

async function setPhotoKey(db: Db, entity: Entity, id: number, key: string | null, contentType: string | null): Promise<void> {
  if (entity === "candidate") {
    await db.update(candidates)
      .set({ photoKey: key, photoContentType: contentType, photoUploadedAt: key ? new Date() : null, updatedAt: new Date() })
      .where(eq(candidates.id, id));
  } else {
    await db.execute(sql`UPDATE team_members SET photo_key=${key}, photo_content_type=${contentType}, photo_uploaded_at=${key ? new Date() : null} WHERE id=${id}`);
  }
}

// Sniff magic bytes instead of trusting the browser-supplied content-type.
function detectImageType(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const form = await request.formData();
    const entity = parseEntity(form.get("entity"));
    const id = Number(form.get("id"));
    const file = form.get("file");
    if (!entity || !id || !(file instanceof File)) return Response.json({ error: "חסר סוג ישות, מזהה או קובץ" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "ניתן להעלות תמונה עד 5MB" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = detectImageType(bytes);
    if (!contentType) return Response.json({ error: "יש להעלות תמונה בפורמט JPEG, PNG או WebP בלבד" }, { status: 400 });

    const db = getDb();
    const oldKey = await getPhotoKey(db, entity, id);

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `${entity}-photos/${id}/${randomUUID()}.${ext}`;
    await uploadObject(key, bytes, contentType);
    await setPhotoKey(db, entity, id, key, contentType);
    if (oldKey && oldKey !== key) await deleteObject(oldKey).catch(() => undefined);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "העלאת התמונה נכשלה" }, { status: 500 });
  }
}

// GET /api/photo?entity=candidate|team&id=X — presigned URL for the current photo
export async function GET(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  const url = new URL(request.url);
  const entity = parseEntity(url.searchParams.get("entity"));
  const id = Number(url.searchParams.get("id"));
  if (!entity || !id) return Response.json({ error: "חסר סוג ישות או מזהה" }, { status: 400 });

  const db = getDb();
  const key = await getPhotoKey(db, entity, id);
  if (!key) return Response.json({ error: "אין תמונה" }, { status: 404 });
  const signedUrl = await getPresignedUrl(key);
  return Response.json({ url: signedUrl });
}

export async function DELETE(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  const body = (await request.json().catch(() => null)) as { entity?: string; id?: number } | null;
  const entity = parseEntity(body?.entity ?? null);
  const id = Number(body?.id);
  if (!entity || !id) return Response.json({ error: "חסר סוג ישות או מזהה" }, { status: 400 });

  const db = getDb();
  const key = await getPhotoKey(db, entity, id);
  if (key) await deleteObject(key).catch(() => undefined);
  await setPhotoKey(db, entity, id, null, null);
  return Response.json({ ok: true });
}
