import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const createNextConfig = (phase: string): NextConfig => {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    output: "export",
    ...(isDevelopmentServer
      ? {
          rewrites: async () => {
            const backendOrigin =
              process.env.BACKEND_API_ORIGIN ?? "http://backend-dev:8000";

            return [
              {
                source: "/api/:path*",
                destination: `${backendOrigin}/api/:path*`,
              },
            ];
          },
        }
      : {}),
  };
};

export default createNextConfig;
