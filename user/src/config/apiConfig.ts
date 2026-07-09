// 環境変数からAPIのベースURLを取得(orvalのmutatorで使用する. mutatorではviteの機能であるimport.meta.envを直接扱えないため、別ファイルで定義しておく)
// VITE_API_BASE_URLが空の場合は現在のオリジン(window.location.origin)を使う。
// これによりngrok等でフロントのみHTTPS公開した場合でも、Viteのdev server proxyを介して
// 同一オリジンでAPIにアクセスできる(CORS・mixed contentを回避するため)。
const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL =
  envBaseUrl && envBaseUrl.length > 0
    ? envBaseUrl
    : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:8080"; // デフォルトのベースURLを設定

// APIが返す画像URL(SeaweedFSのSTORAGE_PUBLIC_URL基準の絶対URL、例: http://localhost:8333/...)を
// 現在のオリジンからの相対パスに変換する。
// ngrok等でフロントのみHTTPS公開した場合、絶対URLのlocalhostはスマホ自身を指してしまい読み込めないため、
// 同一オリジン(Vite dev server proxy経由)でアクセスできるようにする。
export function toSameOriginUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}