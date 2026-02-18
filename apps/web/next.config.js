/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['shared'],
  images: {
    unoptimized: true,
  },
  // Cloudflare Pages: trailing slash for clean URLs
  trailingSlash: true,
};

module.exports = nextConfig;
