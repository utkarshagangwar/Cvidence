import { describe, expect, it } from "vitest";
import { extractBalanced, JsonRepairError, parseJsonLoose, removeTrailingCommas } from "@/lib/ai/json-repair";

describe("parseJsonLoose", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(parseJsonLoose('```json\n{"title":"SDET"}\n```')).toEqual({ title: "SDET" });
  });

  it("ignores preamble and trailing prose", () => {
    expect(parseJsonLoose('Sure! Here it is:\n{"ok":true}\nHope this helps.')).toEqual({ ok: true });
  });

  it("removes trailing commas", () => {
    expect(parseJsonLoose('{"skills":["a","b",],}')).toEqual({ skills: ["a", "b"] });
  });

  it("keeps braces and commas inside strings", () => {
    expect(parseJsonLoose('note: {"text":"use {x}, then ]", "n":2,}')).toEqual({ text: "use {x}, then ]", n: 2 });
  });

  it("handles escaped quotes inside strings", () => {
    expect(parseJsonLoose('{"q":"she said \\"hi\\" }"}')).toEqual({ q: 'she said "hi" }' });
  });

  it("parses a top-level array", () => {
    expect(parseJsonLoose("result: [1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("strips a BOM", () => {
    expect(parseJsonLoose('﻿{"a":1}')).toEqual({ a: 1 });
  });

  it.each(["", "   ", "no json here", '{"a":', "{]"])("throws on %j", (input) => {
    expect(() => parseJsonLoose(input)).toThrow(JsonRepairError);
  });

  it("refuses huge input", () => {
    expect(() => parseJsonLoose("x".repeat(200_001))).toThrow(JsonRepairError);
  });
});

describe("helpers", () => {
  it("extractBalanced returns null for mismatched brackets", () => {
    expect(extractBalanced("{ [ }")).toBeNull();
  });

  it("removeTrailingCommas leaves normal commas alone", () => {
    expect(removeTrailingCommas('{"a":1, "b":2}')).toBe('{"a":1, "b":2}');
  });
});
