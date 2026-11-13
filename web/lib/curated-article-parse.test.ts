import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTICLE_EXCERPT_MAX,
  findArticleBodyImages,
  buildNewsSearchFeedUrl,
  htmlToPlainText,
  matchesKeywordRules,
  normalizeArticleUrl,
  normalizeKeywords,
  parseFeed,
  parsePagePreview,
  stripPublisherSuffix,
  truncateText,
  unwrapAggregatorLink,
} from "./curated-article-parse.ts";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Science</title>
    <link>https://example.org/</link>
    <item>
      <title>Researchers discover a new deep-sea species &amp; its glow</title>
      <link>https://example.org/news/new-species?utm_source=rss&amp;utm_medium=feed&amp;id=7</link>
      <description><![CDATA[<p>A <b>remarkable</b> find off the coast.</p>]]></description>
      <pubDate>Wed, 11 Nov 2026 09:43:55 EST</pubDate>
      <media:content url="https://cdn.example.org/species.jpg" medium="image" />
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.org/news/second</link>
      <description>Plain text summary.</description>
      <content:encoded><![CDATA[<p>Body <img src="https://cdn.example.org/inline.png" /></p>]]></content:encoded>
    </item>
    <item>
      <title></title>
      <link>https://example.org/news/untitled</link>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Teachers start a community garden</title>
    <link rel="alternate" type="text/html" href="https://atom.example.com/garden"/>
    <link rel="enclosure" href="https://atom.example.com/garden.mp3"/>
    <published>2026-11-10T08:00:00Z</published>
    <summary type="html">&lt;p&gt;Students and teachers planted &lt;em&gt;40&lt;/em&gt; trees.&lt;/p&gt;</summary>
  </entry>
</feed>`;

describe("[AC:dfdf223a:ac_3] feed parsing, dedupe normalization and keyword rules", () => {
  it("parses RSS entries with decoded titles, plain-text summaries, dates and feed images", () => {
    const feed = parseFeed(RSS, "https://example.org/feed");
    assert.equal(feed.title, "Example Science");
    assert.equal(feed.entries.length, 2, "an entry with no title is dropped");
    const [first, second] = feed.entries;
    assert.equal(first.title, "Researchers discover a new deep-sea species & its glow");
    assert.equal(first.summary, "A remarkable find off the coast.");
    assert.equal(first.imageUrl, "https://cdn.example.org/species.jpg");
    assert.ok(first.publishedAt instanceof Date && !Number.isNaN(first.publishedAt.getTime()));
    assert.equal(second.summary, "Plain text summary.");
    assert.equal(second.imageUrl, "https://cdn.example.org/inline.png", "falls back to the first <img> in the entry HTML");
    assert.equal(second.publishedAt, null);
  });

  it("parses Atom entries, preferring the alternate link", () => {
    const feed = parseFeed(ATOM, "https://atom.example.com/feed");
    assert.equal(feed.entries.length, 1);
    assert.equal(feed.entries[0].link, "https://atom.example.com/garden");
    assert.equal(feed.entries[0].summary, "Students and teachers planted 40 trees.");
    assert.equal(feed.entries[0].publishedAt?.toISOString(), "2026-11-10T08:00:00.000Z");
  });

  it("rejects an HTML page served at a feed URL", () => {
    assert.throws(() => parseFeed("<!doctype html><html><head><title>Moved</title></head><body></body></html>"), /Not an RSS or Atom feed/);
  });

  it("normalizes URLs so the same story dedupes: tracking params, fragment, param order, trailing slash", () => {
    const a = normalizeArticleUrl("https://Example.org/news/story/?utm_source=x&b=2&a=1#comments");
    const b = normalizeArticleUrl("https://example.org/news/story?a=1&fbclid=abc&b=2");
    assert.equal(a, "https://example.org/news/story?a=1&b=2");
    assert.equal(a, b);
    assert.equal(normalizeArticleUrl("https://www.example.org/x"), "https://www.example.org/x", "www is kept: it's the link members follow");
    assert.equal(normalizeArticleUrl("javascript:alert(1)"), null);
    assert.equal(normalizeArticleUrl("not a url"), null);
  });

  it("unwraps Bing News click-tracking links to the real article", () => {
    const wrapped =
      "http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=1&url=https%3a%2f%2fwww.brandeis.edu%2fstudent-engagement%2fservice%2f&c=1&mkt=en-us";
    assert.equal(unwrapAggregatorLink(wrapped), "https://www.brandeis.edu/student-engagement/service/");
    assert.equal(unwrapAggregatorLink("https://example.org/a"), "https://example.org/a");
    assert.equal(
      buildNewsSearchFeedUrl(" students community project "),
      "https://www.bing.com/news/search?q=students+community+project&format=rss&mkt=en-US",
    );
  });

  it("applies include/exclude keyword rules as whole words, ignoring case", () => {
    const rules = { includeKeywords: normalizeKeywords(["Volunteer", "students", " "]), excludeKeywords: ["mice"] };
    assert.deepEqual(rules.includeKeywords, ["volunteer", "students"]);
    assert.equal(matchesKeywordRules("Students build a library", rules), true);
    assert.equal(matchesKeywordRules("A study in mice shows students learn", rules), false, "an exclude match wins");
    assert.equal(matchesKeywordRules("Startup news", { includeKeywords: ["art"], excludeKeywords: [] }), false, "no partial-word match");
    assert.equal(matchesKeywordRules("Anything at all", { includeKeywords: [], excludeKeywords: [] }), true, "no include list keeps everything");
    assert.equal(matchesKeywordRules("New 3D  printing lab", { includeKeywords: ["3d printing"], excludeKeywords: [] }), true);
  });
});

describe("[AC:dfdf223a:ac_4] link-preview metadata only, never article text", () => {
  const page = `<!doctype html><html><head>
    <title>Fallback Title | Site</title>
    <meta property="og:title" content="Moss as living infrastructure &amp; more">
    <meta content="https://cdn.example.org/moss.jpg" property="og:image" />
    <meta name="description" content="Cities are testing moss walls.">
    <meta property="og:site_name" content="Reasons to be Cheerful">
    <link rel="canonical" href="/moss-as-living-infrastructure">
  </head><body><article><p>SECRET FULL ARTICLE BODY</p></article></body></html>`;

  it("reads Open Graph tags (any attribute order) and resolves relative URLs", () => {
    const preview = parsePagePreview(page, "https://reasonstobecheerful.world/moss-as-living-infrastructure?utm_source=x");
    assert.deepEqual(preview, {
      title: "Moss as living infrastructure & more",
      description: "Cities are testing moss walls.",
      imageUrl: "https://cdn.example.org/moss.jpg",
      siteName: "Reasons to be Cheerful",
      canonicalUrl: "https://reasonstobecheerful.world/moss-as-living-infrastructure",
      bodyImageUrls: [],
    });
    assert.ok(!JSON.stringify(preview).includes("SECRET"), "body text is never read");
  });

  it("falls back to <title> when there are no OG tags", () => {
    const preview = parsePagePreview("<html><head><title>Only a title</title></head></html>", "https://e.org/");
    assert.equal(preview.title, "Only a title");
    assert.equal(preview.imageUrl, null);
  });

  it("caps excerpts at a teaser length on a word boundary", () => {
    const long = "word ".repeat(200);
    const cut = truncateText(long, ARTICLE_EXCERPT_MAX);
    assert.ok(cut.length <= ARTICLE_EXCERPT_MAX + 1);
    assert.ok(cut.endsWith("…"));
    assert.equal(htmlToPlainText("<p>a&nbsp;b</p><script>x()</script>"), "a b");
    assert.equal(stripPublisherSuffix("Big news - The Daily", "The Daily"), "Big news");
  });
});

describe("[AC:57bbacfa:ac_1] [AC:57bbacfa:ac_2] article-body image fallback candidates", () => {
  const page = `<html><head><title>x</title></head><body>
    <header><img src="/static/site-photo-header.jpg"></header>
    <aside><img src="https://cdn.example.org/sidebar-promo.jpg"></aside>
    <article class="story">
      <img src="/assets/logo.png" alt="Students share their project">
      <img src="/img/diagram.svg">
      <img src="/img/animation.gif">
      <img src="data:image/png;base64,AAAA">
      <img src="/img/thumb.jpg" width="80" height="80">
      <img class="author-headshot" src="/img/jane.jpg">
      <img src="data:image/gif;base64,R0lGOD" data-src="/img/lead-photo.jpg" alt="Students share their project">
      <img srcset="/img/second-640.jpg 640w, /img/second-1280.jpg 1280w">
      <img src="https://cdn.example.org/third.webp">
      <img src="/img/fourth.jpg"><img src="/img/fifth.jpg">
    </article>
    <footer><img src="/img/footer-photo.jpg"></footer>
  </body></html>`;

  it("takes only story photos from inside <article>, skipping chrome, SVG/GIF, data: URIs and declared-tiny images", () => {
    assert.deepEqual(findArticleBodyImages(page, "https://news.example.org/story/1"), [
      "https://news.example.org/img/lead-photo.jpg",
      "https://news.example.org/img/second-640.jpg",
      "https://cdn.example.org/third.webp",
      "https://news.example.org/img/fourth.jpg",
    ]);
  });

  it("is capped at 4 candidates and falls back to <main>, then <body>", () => {
    const many = `<main>${Array.from({ length: 9 }, (_, i) => `<img src="/p${i}.jpg">`).join("")}</main>`;
    assert.equal(findArticleBodyImages(many, "https://e.org/").length, 4);
    assert.deepEqual(findArticleBodyImages("<body><p>Hi</p><img src='/only.jpg'></body>", "https://e.org/a"), ["https://e.org/only.jpg"]);
    assert.deepEqual(findArticleBodyImages("<body><p>No images</p></body>", "https://e.org/"), []);
  });

  it("is exposed on the page preview alongside the og:image", () => {
    const preview = parsePagePreview(page, "https://news.example.org/story/1");
    assert.equal(preview.imageUrl, null);
    assert.equal(preview.bodyImageUrls[0], "https://news.example.org/img/lead-photo.jpg");
  });
});
