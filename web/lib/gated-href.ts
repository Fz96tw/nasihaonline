/**
 * Which href a public-page link to a members-only route should use (SEO
 * objective cb64a262). Members get the real feature page. Everyone else,
 * including the static HTML crawlers read, gets a public page instead,
 * since the members-only routes redirect to sign-in and are disallowed in
 * robots.txt. A null publicHref means "no link at all for visitors".
 *
 * Dependency-free so node:test can import it directly.
 */
export function resolveGatedHref({
  signedIn,
  href,
  publicHref,
}: {
  /** Clerk's isSignedIn: undefined until Clerk has loaded, which counts as signed out. */
  signedIn: boolean | undefined;
  href: string;
  publicHref: string | null;
}): string | null {
  return signedIn === true ? href : publicHref;
}
