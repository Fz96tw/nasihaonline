"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { resolveGatedHref } from "@/lib/gated-href";

/**
 * A link from a public page to a members-only route. Signed-in members get
 * `href`, everyone else gets `publicHref`, or no link at all when it's null.
 * Public pages are statically rendered, so the HTML crawlers see is the
 * signed-out version; members' links switch over once Clerk loads. See
 * lib/gated-href.ts.
 */
export function GatedLink({
  href,
  publicHref,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; publicHref: string | null }) {
  const { isSignedIn } = useUser();
  const resolved = resolveGatedHref({ signedIn: isSignedIn, href, publicHref });
  if (resolved === null) return null;
  return <Link href={resolved} {...props} />;
}
