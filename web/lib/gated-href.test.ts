import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveGatedHref } from "./gated-href.ts";

test("[AC:cb64a262:ac_1] signed-in members get the real feature page", () => {
  assert.equal(resolveGatedHref({ signedIn: true, href: "/library", publicHref: "/join" }), "/library");
  assert.equal(resolveGatedHref({ signedIn: true, href: "/dashboard", publicHref: null }), "/dashboard");
});

test("[AC:cb64a262:ac_1] visitors, and the pre-hydration static HTML, get the public page or no link", () => {
  assert.equal(resolveGatedHref({ signedIn: false, href: "/library", publicHref: "/join" }), "/join");
  // Clerk not loaded yet: this is what the static HTML (and crawlers) contain.
  assert.equal(
    resolveGatedHref({ signedIn: undefined, href: "/forums", publicHref: "/about/teaching-sharing" }),
    "/about/teaching-sharing",
  );
  assert.equal(resolveGatedHref({ signedIn: false, href: "/dashboard", publicHref: null }), null);
});
