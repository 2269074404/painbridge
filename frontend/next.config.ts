import type { NextConfig } from "next";

// Matches the Ember AI template settings used for Trustail.
const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;
