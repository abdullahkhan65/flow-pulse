/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  },
  images: {
    domains: ['lh3.googleusercontent.com', 'avatars.slack-edge.com'],
  },
};

module.exports = nextConfig;
