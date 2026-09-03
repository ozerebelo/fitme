import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The domain packages ship TypeScript source rather than a build artifact, so
  // they are compiled as part of the app. One less build step to keep in sync.
  transpilePackages: ["@fitme/core", "@fitme/money"],
  typedRoutes: false,
};

export default config;
