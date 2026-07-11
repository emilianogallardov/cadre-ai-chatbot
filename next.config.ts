import type { NextConfig } from "next";

// Deliberately default: no rewrites, no custom headers, no experimental
// flags. Everything the app needs (streaming routes, after(), App Router)
// works on Next.js defaults, and an empty config is easier to trust than a
// tuned one.
const nextConfig: NextConfig = {};

export default nextConfig;
