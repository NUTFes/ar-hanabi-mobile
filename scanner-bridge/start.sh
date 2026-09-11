#!/usr/bin/env bash
# スキャナーブリッジ（Node版）の起動用ワンライナーの本体（macOS / Linux 向け）。
#
# 管理画面に表示されるコマンドから呼ばれる:
#   HANABI_ADMIN_ORIGIN=https://hanabi-admin.nutfes.net curl -fsSL https://hanabi-admin.nutfes.net/bridge/start.sh | bash
#
# やること:
#   1. 管理画面から Node版ブリッジ（server.js ほか）を取得して ~/.hanabi-scanner-bridge に置く
#   2. 取得元の管理画面オリジンを許可Originとしてブリッジを起動する
#
# 前提: Node.js（macOS では `brew install node`）。
# macOS には WIA 相当が無いため、この経路で使えるのは LAN上のeSCLスキャナ（Wi-Fi接続）のみ。
# USB接続のスキャナを使う場合は Windows PC で PowerShell版（start.ps1）を使う。

set -euo pipefail

ORIGIN="${HANABI_ADMIN_ORIGIN:-http://localhost:3000}"
ORIGIN="${ORIGIN%/}"
PORT="${HANABI_BRIDGE_PORT:-8090}"
INSTALL_DIR="${HOME}/.hanabi-scanner-bridge"

if ! command -v node >/dev/null 2>&1; then
  echo "[scanner-bridge] Node.js が見つかりません。" >&2
  echo "[scanner-bridge] macOS: brew install node   （Homebrew: https://brew.sh）" >&2
  echo "[scanner-bridge] または https://nodejs.org からインストールしてください。" >&2
  exit 1
fi

mkdir -p "${INSTALL_DIR}"
echo "[scanner-bridge] 管理画面 ${ORIGIN} からブリッジを取得します..."

for file in server.js mdns.js escl.js identity.js wia-scan.ps1; do
  if ! curl -fsSL "${ORIGIN}/bridge/${file}" -o "${INSTALL_DIR}/${file}"; then
    echo "[scanner-bridge] 取得に失敗しました: ${ORIGIN}/bridge/${file}" >&2
    exit 1
  fi
  echo "[scanner-bridge]   取得: ${file}"
done

echo "[scanner-bridge] 起動します（終了は Ctrl+C）: http://localhost:${PORT}"
echo

export SCANNER_BRIDGE_PORT="${PORT}"
export SCANNER_BRIDGE_ALLOW_ORIGIN="http://localhost:3000,http://127.0.0.1:3000,https://hanabi-admin.nutfes.net,https://hanabi-admin-stg.nutfes.net,${ORIGIN}"
exec node "${INSTALL_DIR}/server.js"
