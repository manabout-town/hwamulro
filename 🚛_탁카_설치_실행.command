#!/bin/bash
cd ~/Desktop/탁카

echo "========================================"
echo "  🚛 탁카 플랫폼 자동 설치 & 배포"
echo "========================================"
echo ""

# git lock 제거
rm -f .git/index.lock 2>/dev/null

# git 추가 커밋
git add -A 2>/dev/null
git -c user.email=qkrgyrbs12@gmail.com -c user.name=manabout-town \
    commit -m "feat: 탁카 플랫폼 완성" 2>/dev/null || true

echo "✅ Step 1/4: npm 패키지 설치 중... (1~2분 소요)"
npm install --legacy-peer-deps

echo ""
echo "✅ Step 2/4: GitHub 레포 생성 & 푸시"
if command -v gh &> /dev/null; then
    gh repo create takca --public --source=. --remote=origin --push 2>/dev/null || \
    (git remote set-url origin https://github.com/manabout-town/takca.git 2>/dev/null; \
     git push -u origin master 2>/dev/null || git push -u origin main 2>/dev/null)
else
    echo "⚠️  gh CLI 없음. 설치 중..."
    brew install gh
    gh auth login
    gh repo create takca --public --source=. --remote=origin --push
fi

echo ""
echo "✅ Step 3/4: Vercel 배포"
npx vercel --prod --yes

echo ""
echo "✅ Step 4/4: Supabase 서비스 롤 키 안내"
echo ""
echo "👉 아래 URL에서 service_role 키를 복사하세요:"
echo "   https://supabase.com/dashboard/project/ahtziazykzmoxrjzmwmh/settings/api"
echo ""
echo "👉 Vercel 환경변수에 추가:"
echo "   https://vercel.com/manabouttowns-projects/takca/settings/environment-variables"
echo ""
echo "========================================"
echo "  🎉 배포 완료!"
echo "========================================"
echo ""
read -p "아무 키나 누르면 종료..."
