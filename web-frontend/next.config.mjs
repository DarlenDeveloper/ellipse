/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep localhost assets isolated from `next build`. Running a production
  // verification while `next dev` is active must not replace its CSS/chunks.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
