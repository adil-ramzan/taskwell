/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework in an "X-Powered-By" response header.
  poweredByHeader: false,
  // instrumentation.ts starts the reminder scheduler with the server.
  experimental: { instrumentationHook: true },
  // Baseline security headers on every response.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Browsers must not guess a different content type than the one sent.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Other sites learn only the origin a visitor came from, never the path.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Taskwell is never shown inside another site's frame (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
