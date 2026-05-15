FROM node:20

# ネイティブモジュールのビルドに必要な可能性のあるツールをインストールします
RUN apt-get update && \
    apt-get install -y python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリケーションのソースコードをコピー
COPY . .

EXPOSE 3000

# next がコマンドとして見つからない場合に備えて、npx を使用
CMD ["sh", "-c", "npm install && ./node_modules/.bin/next dev"]