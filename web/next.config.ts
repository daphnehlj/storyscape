import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:8787';

const nextConfig: NextConfig = {
  transpilePackages: ['@app/shared'],
  // Proxy API + generated assets to the server so there are no CORS issues.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/generated/:path*', destination: `${apiUrl}/generated/:path*` },
    ];
  },
};

export default nextConfig;
