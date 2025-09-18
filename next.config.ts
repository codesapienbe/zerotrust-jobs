import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // @ts-ignore -- Allow using experimental.appDir; TypeScript types may be outdated for this Next.js version
    appDir: true,
  },
};

export default nextConfig;
