import { InterestArea } from "@/lib/generated/prisma/enums";

// Shared between the join application form and the profile edit form
// (both surface the same fixed InterestArea list).
export const INTEREST_AREA_LABELS: Record<InterestArea, string> = {
  [InterestArea.arts_crafts]: "Arts & Crafts",
  [InterestArea.basic_science_research]: "Basic Science Research",
  [InterestArea.biotechnology]: "Biotechnology",
  [InterestArea.business]: "Business",
  [InterestArea.clinical_research]: "Clinical Research",
  [InterestArea.culinary_arts]: "Culinary Arts",
  [InterestArea.data_analytics]: "Data & Analytics",
  [InterestArea.e_learning]: "E-Learning",
  [InterestArea.education]: "Education",
  [InterestArea.engineering]: "Engineering",
  [InterestArea.finance_investing]: "Finance & Investing",
  [InterestArea.government_public_policy]: "Government & Public Policy",
  [InterestArea.health_wellness]: "Health & Wellness",
  [InterestArea.health_tech]: "Health-tech",
  [InterestArea.healthcare]: "Healthcare",
  [InterestArea.leadership_management]: "Leadership & Management",
  [InterestArea.literature_writing]: "Literature & Writing",
  [InterestArea.marketing_sales]: "Marketing & Sales",
  [InterestArea.nonprofit_social_impact]: "Nonprofit & Social Impact",
  [InterestArea.science_philosophy]: "Science & Philosophy",
  [InterestArea.sustainability_environment]: "Sustainability & Environment",
  [InterestArea.tech_development]: "Tech & Development",
  [InterestArea.travel_culture]: "Travel & Culture",
};
