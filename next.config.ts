import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module: keep it out of the bundle and load it from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
  // recorded-calls.json is read at runtime via fs; make sure it ships with the serverless functions.
  outputFileTracingIncludes: {
    "/api/**": ["./data/recorded-calls.json"],
  },
};

export default nextConfig;
