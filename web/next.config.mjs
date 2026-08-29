/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next's client-side Router Cache reuses a cached RSC payload for a
    // previously-visited dynamic route for up to 30s by default (Next
    // 14.2), without re-invoking the page's Server Component — so a
    // cookie written via plain `document.cookie` (not Next's own
    // cookies().set() inside a Server Action/Route Handler, which *does*
    // auto-invalidate this cache) isn't reflected when navigating back to
    // that route within the window. Every page in this app is already
    // dynamically rendered (auth-gated, personalized), so there's no
    // meaningful static-caching benefit being traded away here.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
