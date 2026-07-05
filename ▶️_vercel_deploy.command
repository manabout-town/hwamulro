#!/bin/bash
echo "🚀 Vercel 배포 재시작..."

# symlink로 한글 경로 우회
rm -f /tmp/takca
ln -sf ~/Desktop/탁카 /tmp/takca
cd /tmp/takca

echo "→ vercel 배포 중..."
vercel deploy --prod --yes 2>&1

echo ""
echo "✅ 완료! 아래 URL에서 확인:"
echo "   https://vercel.com/manabouttowns-projects/takca"
echo ""
read -p "엔터를 누르면 종료..."
