// Community carries no image column, so tile art is resolved from this
// static lookup (matches the "What We Do" tile design on the About page)
// rather than the database. Keyed by Community.name.
export const COMMUNITY_IMAGES: Record<string, string> = {
  Healthcare: "/images/Healthcare.jpg",
  Sciences: "/images/science.jpg",
  "Business & Finance": "/images/business-finance.jpg",
  Technology: "/images/technology.jpg",
  "Education & Career": "/images/education-career.jpg",
  Humanities: "/images/humanities.jpg",
  "Arts, Culture & Lifestyle": "/images/arts-culture.jpg",
  "Nature & Outdoor": "/images/nature-outdoor.jpg",
};

export const COMMUNITY_FALLBACK_IMAGE = "/images/mycommunities.jpg";
