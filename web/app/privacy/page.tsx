import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — NASIHA",
};

const SECTIONS = [
  {
    eyebrow: "What We Collect",
    title: "Information You Provide",
    body: "Name, email, professional title, specialty, career stage, country/region, bio, areas of expertise, and — if you choose to upload one — a profile photo. Membership applications also collect a professional reference. Using the platform generates additional records: Knowledge Hours ledger entries, event RSVPs and attendance, forum posts, library submissions, blog posts, and messages you send to other members.",
  },
  {
    eyebrow: "How We Use It",
    title: "Running NASIHA, Nothing Else",
    body: "Member data is collected only to operate the community — membership review, the Member Directory, the Knowledge Hours ledger, event RSVPs, content moderation, and community communications. NASIHA never sells, shares, or uses member data for any purpose outside of running the Organization.",
  },
  {
    eyebrow: "Your Controls",
    title: "Directory Visibility & Data Rights",
    body: "You control whether you appear in the Member Directory and what's visible there. You have the right to access, correct, export, or request deletion of your personal data at any time. Signed-in members can submit an export or deletion request from Settings; it is reviewed and fulfilled by an admin (the Board-appointed Privacy Lead).",
  },
  {
    eyebrow: "Deletion & Retention",
    title: "What Deletion Means in Practice",
    body: "A fulfilled deletion request removes or anonymizes your profile's personal information (name, contact details, bio, photo). Your Knowledge Hours ledger entries and attribution on content you've contributed are retained — de-identified where appropriate — because those records are immutable audit history for the community's credit system and cannot be altered after the fact.",
  },
  {
    eyebrow: "Patient Information",
    title: "Never Shared, Anywhere",
    body: "Identifiable patient information must never appear in NASIHA — not in case discussions, library submissions, forum posts, or messages. Case-based content requires explicit confirmation that all information has been de-identified before it can be shared.",
  },
  {
    eyebrow: "International Operation",
    title: "GDPR & Equivalent Protections",
    body: "NASIHA operates internationally and is written to meet the most stringent applicable data protection standard, including the EU's General Data Protection Regulation (GDPR), regardless of where a member is located.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-8 py-16">
      <div className="mx-auto flex max-w-[760px] flex-col gap-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-muted-foreground">
            How NASIHA collects, uses, and protects member information.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-col gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[.08em] text-primary">
                {section.eyebrow}
              </p>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="leading-[1.8] text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="rounded-[10px] border bg-primary/5 p-6">
          <p className="mb-2 font-bold text-primary">Questions or Requests</p>
          <p className="text-sm leading-[1.7] text-muted-foreground">
            Members can request access, correction, export, or deletion of their data from{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>
            . For any other question, contact us at{" "}
            <a href="mailto:contact@nasihaonline.com" className="underline underline-offset-2">
              contact@nasihaonline.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
