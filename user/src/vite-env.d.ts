/// <reference types="vite/client" />
// vite-env.d.ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSVファイルをテキストとしてインポートする際の型定義
declare module '*.csv?raw' {
  const content: string;
  export default content;
}