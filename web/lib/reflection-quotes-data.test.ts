import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFLECTION_QUOTES } from "../prisma/reflection-quotes-data.ts";

// Terms that would signal scripture framing or a medical-only slant — the pool
// is meant to be general wisdom for any member regardless of faith or field.
const RELIGIOUS_OR_SCRIPTURE = /\b(quran|qur'an|koran|hadith|sunnah|bible|gospel|psalm|scripture|allah|god|lord|prophet|prayer|heaven)\b/i;
const MEDICAL_ONLY = /\b(patient|clinical|clinician|physician|doctor|nurse|diagnos\w*|surgery|surgeon|hospital|medicine|medical)\b/i;

describe("REFLECTION_QUOTES seed data", () => {
  it("holds about six months of quotes", () => {
    assert.ok(REFLECTION_QUOTES.length >= 20 && REFLECTION_QUOTES.length <= 60, `got ${REFLECTION_QUOTES.length}`);
  });

  it("gives every quote text, attribution and a reflection prompt", () => {
    for (const quote of REFLECTION_QUOTES) {
      assert.ok(quote.text.trim().length > 0, "empty text");
      assert.ok(quote.author.trim().length > 0, `missing author: ${quote.text}`);
      assert.ok(quote.prompt.trim().length > 0, `missing prompt: ${quote.text}`);
    }
  });

  it("has no duplicate quote text (the seed's upsert key)", () => {
    const texts = REFLECTION_QUOTES.map((quote) => quote.text);
    assert.equal(new Set(texts).size, texts.length);
  });

  it("uses gender-neutral wording", () => {
    for (const quote of REFLECTION_QUOTES) {
      assert.doesNotMatch(`${quote.text} ${quote.prompt}`, /\b(man|men|he|him|his)\b/i, quote.text);
    }
  });

  it("has no religious/scripture framing or medical-only framing in quote, attribution or prompt", () => {
    for (const quote of REFLECTION_QUOTES) {
      const haystack = `${quote.text} ${quote.author} ${quote.source ?? ""} ${quote.prompt}`;
      assert.doesNotMatch(haystack, RELIGIOUS_OR_SCRIPTURE, quote.text);
      assert.doesNotMatch(haystack, MEDICAL_ONLY, quote.text);
    }
  });
});
