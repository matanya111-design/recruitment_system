// The Anthropic direct provider (see lib/ai/provider.ts) doesn't enforce strict JSON-schema
// validation on tool-call output the way the OpenAI structured-output path does (no `strict:true`
// equivalent). An `array<string>` field can come back as a single string, and occasionally the
// model collapses what should be several array items into ONE string using pseudo-XML markers
// like "<item>a</item><item>b</item>" instead of separate elements. Normalize every such field
// through this helper so callers always get a clean string array.
const ITEM_TAG_RE = /<item>([\s\S]*?)<\/item>/gi;

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const items = [...trimmed.matchAll(ITEM_TAG_RE)].map((m) => m[1].trim()).filter(Boolean);
    if (items.length > 0) return items;
    return [trimmed];
  }
  return [];
}
