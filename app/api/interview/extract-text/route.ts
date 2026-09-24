import { requireAppIdentity } from "@/lib/auth/identity";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Extracts text from an uploaded interview transcript file (.docx / .pdf) so the raw-material
// textarea gets the real content instead of a "paste it yourself" placeholder.
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "חסר קובץ" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "ניתן להעלות קובץ עד 10MB" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const isDocx = (file.type === DOCX_MIME || name.endsWith(".docx")) && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isPdf = file.type === "application/pdf" && bytes.slice(0, 5).toString("ascii") === "%PDF-";

    if (isDocx) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: bytes });
      const text = String(result.value ?? "").trim();
      if (!text) return Response.json({ error: "לא נמצא טקסט בקובץ ה-Word" }, { status: 422 });
      return Response.json({ text });
    }

    if (isPdf) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(pdf, { mergePages: true });
      const text = String(result.text ?? "").trim();
      if (!text) return Response.json({ error: "לא נמצא טקסט בקובץ - ייתכן שזה PDF סרוק" }, { status: 422 });
      return Response.json({ text });
    }

    return Response.json({ error: "פורמט קובץ לא נתמך. יש להעלות .docx או .pdf, או להדביק את הטקסט ידנית." }, { status: 400 });
  } catch (error) {
    console.error("interview extract-text error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "חילוץ הטקסט נכשל" }, { status: 500 });
  }
}
