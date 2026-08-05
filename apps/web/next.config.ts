import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@barbearia-ai/core"],
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Upload de foto da galeria (action recebe o arquivo): padrão é 1MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
