import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: isProd ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  // Electron 호환을 위한 설정 (프로덕션만 적용)
  trailingSlash: isProd,
  // TypeScript 빌드 에러 무시
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
