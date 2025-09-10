FROM golang:1.25

WORKDIR /app

# 必要なパッケージをインストール
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y locales && \
    locale-gen ja_JP.UTF-8 && \
    echo "export LANG=ja_JP.UTF-8" >> ~/.bashrc && \
    rm -rf /var/lib/apt/lists/*

# 環境変数を設定
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV LANG=ja_JP.UTF-8
ENV LANGUAGE=en_US:

# Go関連ファイルを先にコピー
COPY go.mod go.sum ./
RUN go mod download

# 残りのファイルをコピー
COPY . .

# ファイルの存在確認
RUN echo "=== Files in /app ===" && ls -la
RUN echo "=== Checking start.sh ===" && ls -la start.sh || echo "start.sh not found"

# start.shに実行権限を付与（存在する場合）
RUN if [ -f start.sh ]; then chmod +x start.sh; fi

# Airをインストール
RUN go install github.com/air-verse/air@latest

# デフォルトコマンド（配列形式で指定）
CMD ["/bin/bash", "./start.sh"]