/** @type {import('next').NextConfig} */
const path = require('path');
const { config } = require('dotenv');

config({ path: path.join(__dirname, '../../.env') });
process.env.APP_BASE_URL = (process.env.ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@cmp/auth', '@cmp/types', '@cmp/utils'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WEB_URL: process.env.WEB_URL,
    NEXT_PUBLIC_AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    NEXT_PUBLIC_AUTH0_CONFIGURED: process.env.AUTH0_DOMAIN ? 'true' : 'false',
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
    APP_BASE_URL: process.env.APP_BASE_URL,
  },
};

module.exports = nextConfig;
