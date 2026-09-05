"use client";

import Link from "next/link";

/**
 * Leaf `<Link>` that also remembers the clicked community pill in a cookie
 * (one year), same pattern as SortButton/LIBRARY_SORT_COOKIE — so the
 * selection is applied as the default the next time a page using this
 * cookie is visited with no explicit `?community=` param, e.g. navigating
 * from /library to /calendar (or back) via a plain nav link rather than
 * clicking a pill again.
 *
 * Deliberately its own tiny "use client" component rather than adding
 * onClick directly to community-filter-pills-nav.tsx: that component is
 * intentionally NOT "use client" so a Server Component page can pass it a
 * plain `buildHref` closure (a function can only cross the server/client
 * boundary as a Server Action). `href`/`cookieName`/`cookieValue` here are
 * plain strings, computed server-side and safe to pass across that
 * boundary — only the onClick handler itself needs to live on the client.
 */
export function CommunityFilterCookieLink({
  href,
  className,
  cookieName,
  cookieValue,
  children,
}: {
  href: string;
  className: string;
  cookieName: string;
  cookieValue: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={() => {
        document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {children}
    </Link>
  );
}
