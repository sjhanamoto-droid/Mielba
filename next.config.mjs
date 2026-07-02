import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 親ディレクトリの lockfile による誤検知を防ぎ、トレースルートをこのプロジェクトに固定
  outputFileTracingRoot: path.dirname(new URL(import.meta.url).pathname),
  experimental: {
    // 写真（base64 圧縮画像）を Server Action で受け取るため上限を引き上げる
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
