import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@diny/core"],
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Upload de foto de brinquedo (action recebe o arquivo): padrão é 1MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
