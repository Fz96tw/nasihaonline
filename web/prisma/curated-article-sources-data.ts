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
