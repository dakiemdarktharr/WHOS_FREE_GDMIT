import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async rewrites() {
    const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/+$/, "");
    if (!apiBaseUrl) return [];
    return [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
