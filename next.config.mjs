import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 親ディレクトリの lockfile による誤検知を防ぎ、トレースルートをこのプロジェクトに固定
  outputFileTracingRoot: path.dirname(new URL(import.meta.url).pathname),
  experimental: {
    // 写真（base64 圧縮画像）を Server Action で受け取るため上限を引き上げる。
    // ただし本番の実効上限は Vercel 側の 4.5MB（超えると 413）。ここはその手前に置く。
    // 動画はこの経路を通さず、ブラウザから Vercel Blob へ直接アップロードする。
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
