import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/:path*" // En local, manda todo al puerto 8000
            : "/api/", // En Vercel, usa la ruta serverless nativa
      },
    ];
  },
};

export default nextConfig;