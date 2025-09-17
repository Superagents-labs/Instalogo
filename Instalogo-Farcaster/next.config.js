/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'res.cloudinary.com',
      'replicate.delivery',
      'avatars.githubusercontent.com'
    ],
  },
  env: {
    FRAME_BASE_URL: process.env.FRAME_BASE_URL,
    NEYNAR_API_KEY: process.env.NEYNAR_API_KEY,
  },
}

module.exports = nextConfig
