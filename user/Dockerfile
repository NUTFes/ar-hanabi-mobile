# ----------------- STAGE 1: Build -----------------
# Node.jsの軽量イメージをベースにする
# FROM node:20-alpine AS builder
# FROM node:20-alpine
# FROM node:20.19.4-slim
# x86_64アーキテクチャを明示的に指定
# FROM --platform=linux/amd64 node:20-alpine

# x86_64アーキテクチャを明示的に指定
# FROM --platform=linux/amd64 node:20-alpine
# FROM node:18-alpine
FROM node:20
# FROM --platform=linux/amd64 node:18

# 必要なツールをインストール
# RUN apk add --no-cache python3 make g++

# 作業ディレクトリを作成
# WORKDIR /app
WORKDIR /user

# pnpm をインストール
# RUN npm install -g pnpm

# lockファイルと package.json をコピー
# COPY pnpm-lock.yaml ./
# COPY package.json ./

# # 依存関係ファイルを先にコピーしてキャッシュを効かせる
COPY package*.json ./
# package.jsonを先にコピー
# COPY package*.json ./

# 依存関係をインストール
# RUN pnpm install
RUN npm install
# RUN npm install --no-optional

# # Docker環境用の.npmrc(オプション設定)を作成
# RUN echo "target_arch=x64" > .npmrc && \
#     echo "target_platform=linux" >> .npmrc && \
#     echo "cache=/tmp/.npm" >> .npmrc

# # 依存関係をインストール
# RUN npm cache clean --force && \
#     npm install --no-optional

# プロジェクトの全ファイルをコピー
COPY . .

# Viteの開発サーバー用のポートを公開
EXPOSE 5173

# ビルド
# RUN pnpm run build

# ------ 開発用 -------
# Viteの開発サーバーを起動
CMD ["sh", "-c", "npm install && ./node_modules/.bin/vite --host 0.0.0.0"]
# CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]
# CMD ["pnpm", "run", "dev"]

# ------ 本番用 ------
# Viteでビルドを実行
# RUN npm run build

# Viteで実行
# CMD [ "npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173" ]

# # ----------------- STAGE 2: Serve -----------------
# # Nginxの軽量イメージをベースにする
# FROM nginx:stable-alpine

# # ビルドステージからビルド成果物（distディレクトリ）をコピー
# # COPY --from=builder /app/dist /usr/share/nginx/html
# COPY --from=builder /user/dist /usr/share/nginx/html

# # Nginxの設定ファイルをコピー（任意ですが推奨）
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# # 80番ポートを公開
# EXPOSE 80

# # Nginxをフォアグラウンドで起動
# CMD ["nginx", "-g", "daemon off;"]