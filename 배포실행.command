#!/bin/bash
cd "$HOME/Desktop/탁카"
echo "현재 디렉토리: $(pwd)"
echo "🚀 탁카 Vercel 배포 시작..."
vercel --prod --yes
echo ""
echo "✅ 완료! 이 창을 닫아도 됩니다."
read -p "엔터를 누르면 창이 닫힙니다..."
