// One tolerant JSON parser for model replies: handles code fences, preamble,
// trailing prose and trailing commas. It never evaluates anything.

export class JsonRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRepairError";
  }
}

const MAX_INPUT = 200_000;

export function parseJsonLoose(raw: string): unknown {
  if (typeof raw !== "string") throw new JsonRepairError("Reply is not text");
  if (raw.length > MAX_INPUT) throw new JsonRepairError("Reply is too long to parse");

  const text = raw.replace(/^﻿/, "").trim();
  if (!text) throw new JsonRepairError("Reply is empty");

  const direct = tryParse(text);
  if (direct.ok) return direct.value;

  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const block = extractBalanced(text);
  if (block) candidates.push(block);

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed.ok) return parsed.value;
    const cleaned = tryParse(removeTrailingCommas(candidate));
    if (cleaned.ok) return cleaned.value;
  }

  throw new JsonRepairError("Reply did not contain valid JSON");
}

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

/** First balanced {...} or [...] block, ignoring brackets inside strings. */
export function extractBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Drop commas that sit right before } or ], outside strings. */
export function removeTrailingCommas(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      if (s[j] === "}" || s[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}
