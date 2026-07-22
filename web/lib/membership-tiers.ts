export type MembershipTier = {
  name: string;
  tagline: string;
  description: string;
  access: string;
  detail: string;
  gradient: string;
};

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    name: "Active Member",
    tagline: "Full contributors",
    description: "Regular teaching, reviewing, or research contributors.",
    access: "Full access, plus governance voting rights.",
    detail: "Tracked as Knowledge Hours contributions.",
    gradient: "from-blue-600 to-blue-900",
  },
  {
    name: "Associate",
    tagline: "Building momentum",
    description: "Newer members building toward Active status.",
    access: "Full community access to every core feature.",
    detail: "Tier history carries forward as you grow.",
    gradient: "from-violet-600 to-violet-900",
  },
  {
    name: "Student / Trainee",
    tagline: "Future leaders",
    description: "Students and trainees, with lighter contribution expectations.",
    access: "Full community access, lighter expectations.",
    detail: "A low-pressure space to learn before a heavier role.",
    gradient: "from-cyan-600 to-cyan-900",
  },
  {
    name: "Friend of NASIHA",
    tagline: "Welcome, no strings",
    description: "No contribution obligation — free/public content only.",
    access: "Dashboard, Library, Blog, Forums, Contributions, Calendar.",
    detail: "Not in the Member Directory; no Inbox messaging.",
    gradient: "from-gray-500 to-gray-700",
  },
];
