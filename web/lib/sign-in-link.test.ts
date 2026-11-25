import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRedirectPath, signInHref } from "./sign-in-link.ts";

describe("safeRedirectPath", () => {
  it("accepts same-site paths", () => {
    assert.equal(safeRedirectPath("/library/abc"), "/library/abc");
    assert.equal(safeRedirectPath("/forums/general/t1?q=x"), "/forums/general/t1?q=x");
  });

  it("rejects anything that could leave the site", () => {
    for (const value of ["https://evil.example", "//evil.example/x", "/\\evil.example", "library/abc", "", null, undefined]) {
      assert.equal(safeRedirectPath(value), null, String(value));
    }
  });
});

describe("signInHref", () => {
  it("encodes the return path, with an optional origin", () => {
    assert.equal(signInHref("/library/a b"), "/sign-in?redirect_url=%2Flibrary%2Fa%20b");
    assert.equal(signInHref("/review-feedback/x", "https://site.test"), "https://site.test/sign-in?redirect_url=%2Freview-feedback%2Fx");
  });
});
