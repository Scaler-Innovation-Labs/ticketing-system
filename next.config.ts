import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  experimental: {
    // Optimize package imports to reduce bundle size
    optimizePackageImports: [
      '@/components',
      'lucide-react',
      'date-fns',
      'date-fns-tz',
    ],
  },
};

export default nextConfig;
