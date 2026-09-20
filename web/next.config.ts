import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:8787';

const nextConfig: NextConfig = {
  transpilePackages: ['three', '@app/shared'],
  agentRules: false, // don't generate web/AGENTS.md + web/CLAUDE.md; the repo has its own
  // Proxy API, generated assets and uploaded drawings to the server so there are
  // no CORS issues.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/generated/:path*', destination: `${apiUrl}/generated/:path*` },
      { source: '/uploads/:path*', destination: `${apiUrl}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
