import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.68.*"],
  async redirects() {
    return [
      {
        source: "/pantry",
        destination: "/settings/kitchen",
        permanent: true,
      },
      {
        source: "/settings/staples",
        destination: "/settings/kitchen",
        permanent: true,
      },
      {
        source: "/settings",
        destination: "/settings/kitchen",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "meal-planner-images-njordan.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "www.themealdb.com",
      },
    ],
  },
};

export default nextConfig;
