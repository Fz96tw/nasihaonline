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

/**
 * Alt text for each COMMUNITY_IMAGES photo — what's actually in the picture,
 * phrased for the community it stands for (SEO/a11y objective 5). Keep in
 * sync if a photo is swapped. Keyed by Community.name like COMMUNITY_IMAGES.
 */
export const COMMUNITY_IMAGE_ALTS: Record<string, string> = {
  Healthcare: "Healthcare professional in blue scrubs with arms crossed, holding a stethoscope",
  Sciences: "Glowing plasma ball with violet filaments of electricity",
  "Business & Finance": "Professional reviewing financial charts on a tablet beside a calculator and notebook",
  Technology: "Close-up of a computer circuit board covered in microchips",
  "Education & Career": "Young professional with a backpack looking out over a busy city street",
  Humanities: "Small bronze replica of Rodin's The Thinker on a wooden shelf",
  "Arts, Culture & Lifestyle": "Hand-carved wooden panels painted with traditional patterns",
  "Nature & Outdoor": "Hiker with a yellow backpack on a trail through a green mountain valley",
};

/** Image + alt for a community tile; the generic fallback photo is decorative (alt=""). */
export function getCommunityImage(name: string): { image: string; imageAlt: string } {
  const image = COMMUNITY_IMAGES[name];
  return image ? { image, imageAlt: COMMUNITY_IMAGE_ALTS[name] ?? "" } : { image: COMMUNITY_FALLBACK_IMAGE, imageAlt: "" };
}
