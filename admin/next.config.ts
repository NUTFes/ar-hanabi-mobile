import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://app:8080/:path*",
      },
    ];
  },

  // Windows/macOSのバインドマウント（./admin:/app）では、ホスト側のファイル変更が
  // コンテナ内のinotifyへ届かない。そのままだとソースを編集しても再コンパイルされず、
  // 古い画面が配信され続ける（環境変数 WATCHPACK_POLLING では効かなかった）。
  // webpackの監視をポーリングに切り替えて確実に検知させる。
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules", "**/.next", "**/.git"],
      };
    }
    return config;
  },
};

export default nextConfig;
