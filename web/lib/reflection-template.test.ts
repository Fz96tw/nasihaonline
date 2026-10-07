import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_PLACEHOLDERS,
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_TITLE_TEMPLATE,
  buildReflectionValues,
  buildTitleValues,
  findUnknownPlaceholders,
  fitsForumPost,
  fitsForumTitle,
  renderReflectionTemplate,
  shortenQuoteForTitle,
  worstCaseBodyLength,
} from "./reflection-template.ts";
import { reflectionMessageSchema } from "./validation/weekly-reflection.ts";

const monday = new Date(Date.UTC(2030, 0, 7));
const withSource = { text: "Test quote 1", author: "Author 1", source: "Some Book", prompt: "Prompt 1" };
const noSource = { ...withSource, source: null };

describe("default templates: the quote is the title and the prompt leads the body", () => {
  it("title", () => {
    assert.equal(renderReflectionTemplate(DEFAULT_TITLE_TEMPLATE, buildTitleValues(withSource, monday)), "Weekly Reflection: \u201CTest quote 1\u201D");
  });

  it("body, with and without a source", () => {
    assert.equal(
      renderReflectionTemplate(DEFAULT_BODY_TEMPLATE, buildReflectionValues(withSource, monday)),
      "Prompt 1\n\n\u201CTest quote 1\u201D\n\u2014 Author 1, Some Book",
    );
    assert.equal(
      renderReflectionTemplate(DEFAULT_BODY_TEMPLATE, buildReflectionValues(noSource, monday)),
      "Prompt 1\n\n\u201CTest quote 1\u201D\n\u2014 Author 1",
    );
  });

  it("a long quote is shortened with an ellipsis in the title but appears in full in the body", () => {
    const long = { ...withSource, text: "word ".repeat(80).trim() };
    const title = renderReflectionTemplate(DEFAULT_TITLE_TEMPLATE, buildTitleValues(long, monday));
    const body = renderReflectionTemplate(DEFAULT_BODY_TEMPLATE, buildReflectionValues(long, monday));
    assert.ok(title.includes("\u2026"), title);
    assert.ok(title.length <= 200, `title length ${title.length}`);
    assert.ok(!title.includes(long.text));
    assert.ok(body.includes(long.text), "full quote in the body");
  });
});

describe("renderReflectionTemplate", () => {
  it("fills every placeholder, including repeats", () => {
    const out = renderReflectionTemplate("{quote}|{author}|{source}|{attribution}|{prompt}|{weekOf}|{quote}", buildReflectionValues(withSource, monday));
    assert.equal(out, "Test quote 1|Author 1|Some Book|Author 1, Some Book|Prompt 1|Jan 7, 2030|Test quote 1");
  });

  it("renders {source} as empty when there is none", () => {
    assert.equal(renderReflectionTemplate("[{source}]", buildReflectionValues(noSource, monday)), "[]");
  });

  it("never re-expands text that came from a value (single pass)", () => {
    const tricky = { ...withSource, text: "a {prompt} b", prompt: "P" };
    assert.equal(renderReflectionTemplate("{quote} / {prompt}", buildReflectionValues(tricky, monday)), "a {prompt} b / P");
  });

  it("leaves unknown tokens as written", () => {
    assert.equal(renderReflectionTemplate("{qoute}", buildReflectionValues(withSource, monday)), "{qoute}");
  });

  it("supports admin-added text around the placeholders", () => {
    const out = renderReflectionTemplate("Happy Monday!\n\n{quote}\n\nTell us: {prompt}\n\n— The NASIHA team", buildReflectionValues(withSource, monday));
    assert.equal(out, "Happy Monday!\n\nTest quote 1\n\nTell us: Prompt 1\n\n— The NASIHA team");
  });
});

describe("findUnknownPlaceholders", () => {
  it("reports typos once each, in order, and ignores allowed ones", () => {
    assert.deepEqual(findUnknownPlaceholders("{quote} {qoute} {foo} {qoute}", BODY_PLACEHOLDERS), ["{qoute}", "{foo}"]);
    assert.deepEqual(findUnknownPlaceholders("{quote} and {prompt}", BODY_PLACEHOLDERS), []);
  });
});

describe("shortenQuoteForTitle", () => {
  it("leaves short quotes alone and collapses whitespace", () => {
    assert.equal(shortenQuoteForTitle("No act of kindness,\n  no matter how small."), "No act of kindness, no matter how small.");
  });

  it("cuts long quotes at a word boundary with an ellipsis, within the cap", () => {
    const long = "word ".repeat(60).trim();
    const out = shortenQuoteForTitle(long);
    assert.ok(out.length <= 100, `length ${out.length}`);
    assert.ok(out.endsWith("…"));
    assert.ok(!out.slice(0, -1).endsWith(" "));
  });

  it("hard-cuts a single very long word", () => {
    const out = shortenQuoteForTitle("x".repeat(300));
    assert.equal(out.length, 100);
    assert.ok(out.endsWith("…"));
  });
});

describe("length guards", () => {
  it("the defaults fit the forum limits", () => {
    assert.equal(fitsForumPost(DEFAULT_BODY_TEMPLATE), true);
    assert.equal(fitsForumTitle(DEFAULT_TITLE_TEMPLATE), true);
  });

  it("rejects a body template whose worst case would exceed the forum post cap", () => {
    const greedy = "{attribution}".repeat(40); // 40 x 322 = 12,880 worst case
    assert.ok(worstCaseBodyLength(greedy) > 10000);
    assert.equal(fitsForumPost(greedy), false);
  });
});

describe("reflectionMessageSchema", () => {
  const ok = { titleTemplate: DEFAULT_TITLE_TEMPLATE, bodyTemplate: DEFAULT_BODY_TEMPLATE };

  it("accepts the defaults and a title built from the quote", () => {
    assert.equal(reflectionMessageSchema.safeParse(ok).success, true);
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "“{quote}”" }).success, true);
  });

  it("rejects a body without {quote}", () => {
    const r = reflectionMessageSchema.safeParse({ ...ok, bodyTemplate: "Just a {prompt}" });
    assert.equal(r.success, false);
  });

  it("rejects unknown placeholders in the title and the body", () => {
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "Week {weekNumber}" }).success, false);
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "{author}" }).success, false, "author isn't a title placeholder");
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, bodyTemplate: "{quote} {qoute}" }).success, false);
  });

  it("rejects empty and over-length templates", () => {
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "   " }).success, false);
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, bodyTemplate: "" }).success, false);
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "x".repeat(121) }).success, false);
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, bodyTemplate: "{quote}" + "x".repeat(4000) }).success, false);
  });

  it("rejects a title that could exceed the forum title cap", () => {
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, titleTemplate: "{quote}{quote}{quote}" }).success, false);
  });

  it("rejects a body that could exceed the forum post cap", () => {
    assert.equal(reflectionMessageSchema.safeParse({ ...ok, bodyTemplate: "{quote}" + "{attribution}".repeat(40) }).success, false);
  });
});
