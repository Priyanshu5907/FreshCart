/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Netlify deployment
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
    // Allow unoptimized images from external URLs (for Unsplash in showcase)
    unoptimized: false,
  },

  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },

  // Allow backend API calls during build / server actions
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3001',
        'freshcart-backend.onrender.com',
      ],
    },
  },
};

module.exports = nextConfig;
