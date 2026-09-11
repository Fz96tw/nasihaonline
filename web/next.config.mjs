/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // AVIF first (smaller than WebP at equivalent quality for photographic
    // content, which is most of what's in public/images/) with WebP as the
    // fallback for the handful of browsers that support one but not the
    // other; Next always keeps the original format available too for
    // anything neither format's client accepts.
    formats: ["image/avif", "image/webp"],
    // Matches the breakpoints already in use across the marketing pages'
    // Tailwind classes (sm/md/lg/xl) rather than Next's generic defaults,
    // so next/image doesn't generate sizes this app never actually
    // requests.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
  },
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
