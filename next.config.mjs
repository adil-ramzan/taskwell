/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // instrumentation.ts starts the reminder scheduler with the server.
  experimental: { instrumentationHook: true },
};
export default nextConfig;
