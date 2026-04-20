# 概要
- AR花火のユーザー画面と管理者画面とAPI・DBのリポジトリ

# ディレクトリ
- user/：ユーザー画面（Vite + React Three Fiber(R3F) + AR.js + Orval）
  - src/
    - apiClient/ : Orvalで生成したAPIクライアント
    - assets/ : フィナーレのタイムラインのcsvファイル
    - canvas/ : R3FのCanvas
      - canvas/hooks/ : ジャンプ検出などのフック
    - scenes/ : R3FのScene
    - pages;  : ページ
    - components/ : 花火とその他ボタン等のコンポーネント
    - lib/ : ローカルストレージやセットアップ用の関数
- admin/ ：管理者画面（Next.js）
- api/ ：APIサーバーとDBマイグレーション（Go + GORM + oapi-codegen）

# 環境構築
1. メンバーの誰かに`.env`を共有してもらって、プロジェクト直下に`.env`を作成する

# アプリの起動
1. Docker Desktopを起動しておく
2. ターミナルで`docker compose up --build`を実行
3. アクセスできるか確認
  - ユーザー画面：http://localhost:5173
    - イラスト花火：http://localhost:5173
    - ジャンプ花火：http://localhost:5173/detector
    - フィナーレ　：http://localhost:5173/finale
  - 管理者画面　：http://localhost:3000
  - Swagger UI：http://localhost:8081（APIの動作確認などができます）
