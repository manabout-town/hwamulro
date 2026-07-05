#!/bin/bash
# 탁카 플랫폼 배포 스크립트
# 실행 방법: bash DEPLOY.sh

set -e

echo "🚛 탁카 배포 시작..."
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# 1. GitHub 레포 생성 (gh CLI 사용)
echo ""
echo "📦 GitHub 레포 생성 중..."
if command -v gh &> /dev/null; then
  gh repo create takca --public --source=. --remote=origin --push || true
else
  echo "⚠️  GitHub CLI(gh)가 없습니다. 아래 명령어로 설치 후 재실행하세요:"
  echo "   brew install gh && gh auth login"
  echo ""
  echo "또는 수동으로:"
  echo "  1. https://github.com/new 에서 takca 레포 생성"
  echo "  2. git remote add origin https://github.com/manabout-town/takca.git"
  echo "  3. git push -u origin master"
  exit 1
fi

# 2. npm install
echo ""
echo "📦 패키지 설치 중..."
npm install --legacy-peer-deps

# 3. Vercel 배포
echo ""
echo "🚀 Vercel 배포 중..."
if command -v vercel &> /dev/null; then
  vercel --prod
else
  npx vercel --prod
fi

echo ""
echo "✅ 배포 완료!"
