import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEventMetaDescription, buildEventPageTitle } from "./event-seo.ts";

const base = { typeLabel: "Webinar", startsAt: "2026-11-18T13:00:00.000Z", hostName: "Sam Host" };

test("[AC:51c2e8d6:ac_2] event titles include the date, so same-titled events differ", () => {
  const a = buildEventPageTitle({ title: "The Knowledge Exchange Hour", startsAt: "2026-11-18T13:00:00.000Z" });
  const b = buildEventPageTitle({ title: "The Knowledge Exchange Hour", startsAt: "2026-12-02T13:00:00.000Z" });
  assert.equal(a, "The Knowledge Exchange Hour, Nov 18, 2026");
  assert.notEqual(a, b);
});

test("[AC:51c2e8d6:ac_2] meta description is 50–160 chars whatever the event description", () => {
  const cases = [
    null,
    "",
    "Short.",
    "A long description. ".repeat(20),
    "Has an image ![x](https://example.com/a.png) and a link https://example.com and **markdown**.",
  ];
  for (const description of cases) {
    const text = buildEventMetaDescription({ ...base, description });
    assert.ok(text.length >= 50 && text.length <= 160, `${JSON.stringify(description)} -> ${text.length}: ${text}`);
    assert.doesNotMatch(text, /https?:|!\[|\*\*/);
  }
});

test("[AC:51c2e8d6:ac_2] a description that's long enough is used as is", () => {
  const description = "A practical session on structuring peer feedback for research manuscripts.";
  assert.equal(buildEventMetaDescription({ ...base, description }), description);
});

test("[AC:51c2e8d6:ac_2] a missing description falls back to type, date and host", () => {
  const text = buildEventMetaDescription({ ...base, description: null });
  assert.match(text, /^A free online webinar on Nov 18, 2026, hosted by Sam Host/);
  assert.match(buildEventMetaDescription({ ...base, typeLabel: "Workshop", hostName: null, description: null }), /^A free online workshop on/);
});
