import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REFLECTION_AUTHOR_MAX,
  REFLECTION_PROMPT_MAX,
  REFLECTION_QUOTE_TEXT_MAX,
  REFLECTION_SOURCE_MAX,
  createReflectionQuoteSchema,
  reflectionNextQuoteSchema,
  reflectionSettingsSchema,
  updateReflectionQuoteSchema,
} from "./validation/weekly-reflection.ts";

const valid = { text: "A quote", author: "An Author", source: "A Book", prompt: "What do you think?" };

describe("createReflectionQuoteSchema", () => {
  it("accepts a complete quote and trims whitespace", () => {
    const parsed = createReflectionQuoteSchema.parse({ ...valid, text: "  A quote  " });
    assert.equal(parsed.text, "A quote");
  });

  it("rejects empty or whitespace-only quote, author and prompt", () => {
    for (const field of ["text", "author", "prompt"] as const) {
      assert.equal(createReflectionQuoteSchema.safeParse({ ...valid, [field]: "" }).success, false, `${field} empty`);
      assert.equal(createReflectionQuoteSchema.safeParse({ ...valid, [field]: "   " }).success, false, `${field} blank`);
    }
  });

  it("rejects over-length fields but accepts them at the limit", () => {
    const limits = {
      text: REFLECTION_QUOTE_TEXT_MAX,
      author: REFLECTION_AUTHOR_MAX,
      source: REFLECTION_SOURCE_MAX,
      prompt: REFLECTION_PROMPT_MAX,
    };
    for (const [field, max] of Object.entries(limits)) {
      assert.equal(createReflectionQuoteSchema.safeParse({ ...valid, [field]: "x".repeat(max) }).success, true, `${field} at limit`);
      assert.equal(createReflectionQuoteSchema.safeParse({ ...valid, [field]: "x".repeat(max + 1) }).success, false, `${field} over limit`);
    }
  });

  it("treats a missing or blank source as null", () => {
    assert.equal(createReflectionQuoteSchema.parse({ ...valid, source: "" }).source, null);
    assert.equal(createReflectionQuoteSchema.parse({ ...valid, source: undefined }).source, null);
  });
});

describe("updateReflectionQuoteSchema", () => {
  it("allows a partial update and an active toggle alone", () => {
    assert.equal(updateReflectionQuoteSchema.safeParse({ prompt: "New prompt" }).success, true);
    assert.equal(updateReflectionQuoteSchema.safeParse({ active: false }).success, true);
  });

  it("rejects an empty update and still validates any supplied field", () => {
    assert.equal(updateReflectionQuoteSchema.safeParse({}).success, false);
    assert.equal(updateReflectionQuoteSchema.safeParse({ text: "" }).success, false);
    assert.equal(updateReflectionQuoteSchema.safeParse({ prompt: "x".repeat(REFLECTION_PROMPT_MAX + 1) }).success, false);
  });
});

describe("reflectionSettingsSchema", () => {
  it("accepts valid day/hour/enabled and rejects out-of-range values", () => {
    assert.equal(reflectionSettingsSchema.safeParse({ weeklyReflectionEnabled: true, weeklyReflectionDayOfWeek: 0, weeklyReflectionHour: 23 }).success, true);
    assert.equal(reflectionSettingsSchema.safeParse({ weeklyReflectionDayOfWeek: 7 }).success, false);
    assert.equal(reflectionSettingsSchema.safeParse({ weeklyReflectionHour: 24 }).success, false);
    assert.equal(reflectionSettingsSchema.safeParse({ weeklyReflectionHour: 9.5 }).success, false);
    assert.equal(reflectionSettingsSchema.safeParse({}).success, false);
  });
});

describe("reflectionNextQuoteSchema", () => {
  it("requires a quoteId for swap only", () => {
    assert.equal(reflectionNextQuoteSchema.safeParse({ action: "skip" }).success, true);
    assert.equal(reflectionNextQuoteSchema.safeParse({ action: "clear" }).success, true);
    assert.equal(reflectionNextQuoteSchema.safeParse({ action: "swap", quoteId: "abc" }).success, true);
    assert.equal(reflectionNextQuoteSchema.safeParse({ action: "swap" }).success, false);
    assert.equal(reflectionNextQuoteSchema.safeParse({ action: "delete" }).success, false);
  });
});
