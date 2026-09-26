const livekitUrl = process.env.LIVEKIT_URL ?? "wss://livekit.nasihaforyou.org";
const livekitHttp = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

// Production only: `next dev` needs eval/inline HMR, which this policy would block.
// What each source is for:
// - cdn.jsdelivr.net (script + connect): MediaPipe's WASM loader for the webcam overlay
// - storage.googleapis.com (connect): the selfie-segmentation model file
// - 'wasm-unsafe-eval': lets that WASM compile (does not allow JS eval)
// - LiveKit host over wss/https: signalling and the join API; media itself is WebRTC, which CSP doesn't govern
// - blob: workers/media/images: LiveKit's workers and the canvas-composited share track
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self' data:",
  `connect-src 'self' ${livekitUrl} ${livekitHttp} https://cdn.jsdelivr.net https://storage.googleapis.com`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

export default nextConfig;
