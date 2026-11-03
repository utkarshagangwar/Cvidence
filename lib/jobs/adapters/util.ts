// Small helpers shared by adapters for reading untyped JSON safely.

export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Items of `body[key]` that are objects (or of `body` itself when it is an array). */
export function items(body: unknown, key?: string): Obj[] {
  const list = key ? (isObj(body) ? arr(body[key]) : []) : arr(body);
  return list.filter(isObj);
}

export const looksRemote = (...parts: string[]) => parts.some((p) => /\bremote\b|work from home|\bwfh\b/i.test(p));

/** Slugs come from the catalog; still encode them so a bad row can't change the URL path. */
export const seg = (slug: string) => encodeURIComponent(slug);
