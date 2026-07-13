import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude pdfjs-dist from server-side bundling (it's browser-only)
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
