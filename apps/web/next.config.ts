import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@diny/core"],
  reactStrictMode: true,
};

export default nextConfig;
