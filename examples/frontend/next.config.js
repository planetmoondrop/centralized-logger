/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Expose build-time env vars to the browser (replaces VITE_ prefix convention)
  env: {
    NEXT_PUBLIC_API_URL:      process.env.NEXT_PUBLIC_API_URL      ?? 'http://localhost:3003/api',
    NEXT_PUBLIC_TRACE_VIEWER: process.env.NEXT_PUBLIC_TRACE_VIEWER ?? 'http://localhost:3003/_trace',
  },
}
module.exports = nextConfig
