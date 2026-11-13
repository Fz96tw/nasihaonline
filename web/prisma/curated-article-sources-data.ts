// Starter "From the Web" sources (prisma/seed.ts → seedCuratedArticleSources),
// inserted once per environment; admins manage them at
// /admin/curated-articles/sources from then on. Every feed URL here was
// checked to return a parseable RSS/Atom feed with recent entries
// (2026-11-12). `communities` are Community slugs (seed.ts's COMMUNITIES);
// an empty list means the source isn't tied to one community.
//
// Keyword lists narrow the high-volume or broad feeds to the themes members
// care about: discoveries, education efforts and community service.

export type StarterArticleSource = {
  name: string;
  kind: "rss" | "news_search";
  url: string;
  communities: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  enabled?: boolean;
};

const COMMUNITY_SERVICE_KEYWORDS = [
  "volunteer", "volunteers", "volunteering", "community", "students", "school", "schools", "teacher", "teachers",
  "nonprofit", "charity", "donated", "donation", "kindness", "service", "mentor", "mentoring", "library",
];

export const STARTER_ARTICLE_SOURCES: StarterArticleSource[] = [
  // Healthcare
  {
    name: "ScienceDaily: Health & Medicine",
    kind: "rss",
    url: "https://www.sciencedaily.com/rss/health_medicine.xml",
    communities: ["healthcare"],
    includeKeywords: ["discovery", "breakthrough", "study finds", "new treatment", "prevention", "public health", "nutrition", "clinical trial"],
  },
  { name: "The Conversation: Health", kind: "rss", url: "https://theconversation.com/us/health/articles.atom", communities: ["healthcare"] },

  // Sciences
  { name: "NASA News", kind: "rss", url: "https://www.nasa.gov/news-release/feed/", communities: ["sciences"] },
  {
    name: "ScienceDaily: Top Science",
    kind: "rss",
    url: "https://www.sciencedaily.com/rss/top/science.xml",
    communities: ["sciences"],
    includeKeywords: ["discovery", "discovered", "first", "reveals", "breakthrough", "ancient", "fossil", "new species"],
  },
  { name: "Smithsonian: Science & Nature", kind: "rss", url: "https://www.smithsonianmag.com/rss/science-nature/", communities: ["sciences", "nature-outdoor"] },
  {
    name: "Phys.org",
    kind: "rss",
    url: "https://phys.org/rss-feed/",
    communities: ["sciences"],
    includeKeywords: ["discovery", "discovered", "first", "reveals", "breakthrough", "researchers find"],
  },

  // Business & Finance
  { name: "The Conversation: Economy", kind: "rss", url: "https://theconversation.com/us/business/articles.atom", communities: ["business-finance"] },
  { name: "Knowledge at Wharton", kind: "rss", url: "https://knowledge.wharton.upenn.edu/feed/", communities: ["business-finance"] },

  // Technology
  { name: "MIT News", kind: "rss", url: "https://news.mit.edu/rss/feed", communities: ["technology", "sciences"] },
  { name: "The Conversation: Science + Tech", kind: "rss", url: "https://theconversation.com/us/technology/articles.atom", communities: ["technology"] },
  { name: "Ars Technica: Science", kind: "rss", url: "https://feeds.arstechnica.com/arstechnica/science", communities: ["technology", "sciences"] },

  // Education & Career
  { name: "The Hechinger Report", kind: "rss", url: "https://hechingerreport.org/feed/", communities: ["education-career"] },
  { name: "The Conversation: Education", kind: "rss", url: "https://theconversation.com/us/education/articles.atom", communities: ["education-career"] },
  { name: "EdSurge", kind: "rss", url: "https://www.edsurge.com/articles_rss", communities: ["education-career"] },

  // Humanities
  { name: "Aeon", kind: "rss", url: "https://aeon.co/feed.rss", communities: ["humanities"] },
  { name: "JSTOR Daily", kind: "rss", url: "https://daily.jstor.org/feed/", communities: ["humanities"] },
  { name: "Smithsonian: History", kind: "rss", url: "https://www.smithsonianmag.com/rss/history/", communities: ["humanities"] },
  { name: "The Conversation: Arts + Culture", kind: "rss", url: "https://theconversation.com/us/arts/articles.atom", communities: ["humanities", "arts-culture-lifestyle"] },

  // Arts, Culture & Lifestyle
  { name: "Smithsonian: Arts & Culture", kind: "rss", url: "https://www.smithsonianmag.com/rss/arts-culture/", communities: ["arts-culture-lifestyle"] },
  { name: "Atlas Obscura", kind: "rss", url: "https://www.atlasobscura.com/feeds/latest", communities: ["arts-culture-lifestyle"] },
  { name: "Colossal", kind: "rss", url: "https://www.thisiscolossal.com/feed/", communities: ["arts-culture-lifestyle"] },

  // Nature & Outdoor
  { name: "ScienceDaily: Earth & Climate", kind: "rss", url: "https://www.sciencedaily.com/rss/earth_climate.xml", communities: ["nature-outdoor"], includeKeywords: ["conservation", "wildlife", "species", "restoration", "forest", "ocean", "discovery"] },
  { name: "Mongabay", kind: "rss", url: "https://news.mongabay.com/feed/", communities: ["nature-outdoor"] },
  { name: "Audubon News", kind: "rss", url: "https://www.audubon.org/rss.xml", communities: ["nature-outdoor"] },

  // Community service & positive impact (not tied to one community)
  { name: "Reasons to be Cheerful", kind: "rss", url: "https://reasonstobecheerful.world/feed/", communities: [] },
  { name: "Good News Network", kind: "rss", url: "https://www.goodnewsnetwork.org/feed/", communities: [], includeKeywords: COMMUNITY_SERVICE_KEYWORDS },
  { name: "YES! Magazine", kind: "rss", url: "https://www.yesmagazine.org/feed", communities: [] },
  // A working example of a news search, off by default: Bing's search feed
  // returns few recent results, so enable it only if it proves useful.
  {
    name: "News search: students' community projects",
    kind: "news_search",
    url: "students community project",
    communities: ["education-career"],
    enabled: false,
  },
];

// ---------------------------------------------------------------------------
// Batch 2 — international, English-language sources (added 2026-11-12 for an
// international membership; feeds checked live and declared/written in
// English that day). General-news outlets carry keyword filters so politics,
// conflict and sport don't flood the review queue.
// ---------------------------------------------------------------------------

const GENERAL_NEWS_INCLUDE = [
  "science", "scientists", "scientific", "research", "researchers", "study", "discovery", "discovered",
  "university", "universities", "students", "school", "schools", "education", "teachers", "scholarship",
  "innovation", "technology", "health", "hospital", "vaccine", "medicine",
  "volunteer", "volunteers", "community", "charity", "nonprofit", "donated",
  "environment", "conservation", "climate", "wildlife", "heritage", "museum", "library",
];
const GENERAL_NEWS_EXCLUDE = [
  "election", "elections", "killed", "airstrike", "bombing", "shooting", "militants", "troops",
  "football", "cricket", "tournament", "league", "match", "stocks",
];

export const INTERNATIONAL_ARTICLE_SOURCES: StarterArticleSource[] = [
  // Focused on knowledge, discovery and impact
  { name: "The Conversation: Africa", kind: "rss", url: "https://theconversation.com/africa/articles.atom", communities: [] },
  { name: "The Conversation: Australia", kind: "rss", url: "https://theconversation.com/au/articles.atom", communities: [] },
  { name: "AllAfrica: Science & Biotechnology", kind: "rss", url: "https://allafrica.com/tools/headlines/rdf/science/headlines.rdf", communities: ["sciences"] },
  { name: "The Hindu: Science", kind: "rss", url: "https://www.thehindu.com/sci-tech/science/feeder/default.rss", communities: ["sciences"] },
  { name: "Times of India: Science", kind: "rss", url: "https://www.timesofindia.indiatimes.com/rssfeeds/-2128672765.cms", communities: ["sciences"] },
  { name: "The Better India", kind: "rss", url: "https://www.thebetterindia.com/feed/", communities: [] },
  { name: "Mongabay India", kind: "rss", url: "https://india.mongabay.com/feed/", communities: ["nature-outdoor"] },
  { name: "Rest of World", kind: "rss", url: "https://restofworld.org/feed/latest", communities: ["technology"] },
  { name: "South China Morning Post: Tech", kind: "rss", url: "https://www.scmp.com/rss/36/feed", communities: ["technology"] },
  { name: "Global Voices", kind: "rss", url: "https://globalvoices.org/feed/", communities: ["humanities"] },
  { name: "UN News", kind: "rss", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", communities: [] },
  { name: "Health Policy Watch", kind: "rss", url: "https://healthpolicy-watch.news/feed/", communities: ["healthcare"] },
  { name: "The PIE News", kind: "rss", url: "https://thepienews.com/feed/", communities: ["education-career"] },
  // General news, filtered to knowledge/education/health/community stories
  ...[
    { name: "Arab News", url: "https://www.arabnews.com/rss.xml" },
    { name: "The National (UAE)", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
    { name: "Dawn (Pakistan)", url: "https://www.dawn.com/feeds/home" },
    { name: "Daily Maverick (South Africa)", url: "https://www.dailymaverick.co.za/dmrss/" },
    { name: "Africanews", url: "https://www.africanews.com/feed/rss" },
    { name: "Premium Times (Nigeria)", url: "https://www.premiumtimesng.com/feed" },
    { name: "The Japan Times", url: "https://www.japantimes.co.jp/feed/" },
    { name: "CNA (Singapore)", url: "https://www.channelnewsasia.com/rssfeeds/8395986" },
  ].map(
    (source): StarterArticleSource => ({
      ...source,
      kind: "rss",
      communities: [],
      includeKeywords: GENERAL_NEWS_INCLUDE,
      excludeKeywords: GENERAL_NEWS_EXCLUDE,
      enabled: true,
    }),
  ),
];

/**
 * Starter sources in the order they were introduced. Each environment gets
 * every batch newer than SiteSettings.curatedArticleSourcesSeedVersion, once.
 * Add new sources as a new batch — never edit a released batch, since
 * environments that already have it won't see the change.
 */
export const STARTER_SOURCE_BATCHES: { version: number; sources: StarterArticleSource[] }[] = [
  { version: 1, sources: STARTER_ARTICLE_SOURCES },
  { version: 2, sources: INTERNATIONAL_ARTICLE_SOURCES },
];
