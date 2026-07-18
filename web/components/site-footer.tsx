import Link from "next/link";
import { EDUCATIONAL_DISCLAIMER } from "@/lib/legal";

const COMMUNITY_LINKS = [
  { label: "Our Mission", href: "/about" },
  { label: "Our Team", href: "/our-team" },
  { label: "Join NASIHA", href: "/join" },
  { label: "Support Us", href: "/donate" },
  { label: "Contact Us", href: "/contact" },
];

const MEMBER_LINKS = [
  { label: "Log In", href: "/sign-in" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Privacy Policy", href: "/privacy" },
];

export function SiteFooter() {
  return (
    <footer className="bg-slate-900 px-8 pb-8 pt-12 text-white/60">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 border-b border-white/[.08] pb-8 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:gap-12">
        <div>
          <p className="mb-2 text-lg font-extrabold tracking-[.1em] text-white">
            NASIHA
          </p>
          <p className="max-w-[300px] text-sm leading-[1.7]">
            A non-profit community dedicated to free, reciprocal knowledge exchange
            among learners and teachers worldwide.
          </p>
          <p className="mt-3 max-w-[300px] text-sm leading-[1.7]">
            NASIHA — Dedicated to Narjis and Syed Iftikhar Hussain Abidi, who guided
            us toward a life of learning.
          </p>
        </div>
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[.08em] text-white/50">
            Get Involved
          </p>
          {COMMUNITY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="mb-2 block text-sm text-white/55 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[.08em] text-white/50">
            Members
          </p>
          {MEMBER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="mb-2 block text-sm text-white/55 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[1120px] pt-8">
        <p className="text-sm">
          © {new Date().getFullYear()} NASIHA — A Non-Profit Organization
        </p>
        <p className="mt-4 text-xs text-white/35">{EDUCATIONAL_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
