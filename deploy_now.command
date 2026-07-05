#!/bin/bash
echo '최종 배포 시작...'
cd ~/Desktop/탁카
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null
git add -A
git commit -m "fix: wrap useSearchParams in Suspense boundaries"
echo ''
echo 'Vercel 배포 중...'
vercel deploy --prod --yes
echo ''
echo '완료!'
read -p '엔터 종료...'
