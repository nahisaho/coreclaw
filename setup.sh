#!/bin/bash
# CoreClaw セットアップ & ビルドスクリプト
# 実行: bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  CoreClaw Setup & Build"
echo "============================================"
echo ""

# --- 1. npm install ---
echo "📦 Installing npm dependencies..."
npm install
echo ""

# --- 2. .env の生成 ---
echo "⚙️  Generating .env..."

# gh CLI の存在確認
if ! command -v gh &>/dev/null; then
  echo "❌ エラー: gh CLI が見つかりません。"
  echo "   GitHub CLI をインストールしてから再実行してください。"
  echo "   インストール方法: https://cli.github.com/"
  exit 1
fi

# GitHub token を gh CLI から取得
GH_TOKEN="$(gh auth token 2>/dev/null || true)"
if [ -z "$GH_TOKEN" ]; then
  echo "❌ エラー: gh auth token が取得できませんでした。"
  echo "   先に 'gh auth login' を実行してください。"
  exit 1
fi

cp .env.example .env
echo "GITHUB_TOKEN=${GH_TOKEN}" > .env
grep -v '^GITHUB_TOKEN=' .env.example | grep -v '^#\s*CONTAINER_TIMEOUT' >> .env
echo "CONTAINER_TIMEOUT=3600000" >> .env
echo "   GitHub token: set via gh CLI"
echo "   CONTAINER_TIMEOUT: 3600000 ms (1 hour)"
echo ""

# --- 3. TypeScript ビルド ---
echo "🔨 Building TypeScript (npm run build)..."
npm run build
echo ""

# --- 4. Docker コンテナイメージのビルド ---
echo "🐳 Building Docker container image..."
./container/build.sh
echo ""

echo "============================================"
echo "  ✅ セットアップ完了!"
echo "============================================"
echo ""
echo "起動方法:"
echo "  node dist/index.js"
echo ""
