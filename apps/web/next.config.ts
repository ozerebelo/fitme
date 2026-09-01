import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // @fitme/core ships TypeScript source rather than a build artifact, so it is
  // compiled as part of the app. One less build step to keep in sync.
  transpilePackages: ["@fitme/core"],
  typedRoutes: false,
};

export default config;
