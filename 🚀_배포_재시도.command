#!/bin/bash
cd ~/Desktop/탁카

echo "========================================"
echo "  🚛 탁카 - GitHub & Vercel 배포"
echo "========================================"

# ── 1. GitHub ──────────────────────────────
echo ""
echo "[ 1/3 ] GitHub 레포 생성 & 푸시..."

# git remote 확인
REMOTE=$(git remote get-url origin 2>/dev/null)

if [ -z "$REMOTE" ]; then
  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    echo "→ gh CLI로 레포 생성..."
    gh repo create takca --public --source=. --remote=origin --push && \
      echo "✅ GitHub 푸시 완료" || echo "⚠️  gh 실패 - 수동 설정 필요"
  else
    echo "⚠️  gh CLI 미인증. 아래 명령어를 수동으로 실행해주세요:"
    echo ""
    echo "  git remote add origin https://github.com/manabout-town/takca.git"
    echo "  git push -u origin main"
    echo ""
  fi
else
  echo "✅ GitHub remote 이미 설정됨: $REMOTE"
  git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || true
fi

# ── 2. Vercel (한글 경로 우회: symlink 사용) ──
echo ""
echo "[ 2/3 ] Vercel 배포 (한글 경로 우회)..."

# /tmp/takca 심볼릭 링크 생성 (ASCII 경로)
rm -rf /tmp/takca
ln -sf ~/Desktop/탁카 /tmp/takca
cd /tmp/takca

# .vercel 폴더 초기화
rm -rf .vercel

if command -v vercel &>/dev/null; then
  echo "→ vercel CLI로 배포..."
  vercel --prod --yes --name takca \
    --env NEXT_PUBLIC_SUPABASE_URL="https://ahtziazykzmoxrjzmwmh.supabase.co" \
    --env NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodHppYXp5a3ptb3hyanptd21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTUyMjcsImV4cCI6MjA5NTM5MTIyN30.RrF05mb7zqUSbY0vu1T75l9nRnL6wbSzyzt-KPid9OU" \
    --env NEXT_PUBLIC_TOSS_CLIENT_KEY="test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq" \
    --env NEXT_PUBLIC_APP_URL="https://takca.vercel.app" && \
    echo "✅ Vercel 배포 완료!" || echo "⚠️  Vercel 배포 실패"
else
  echo "→ npx vercel로 배포..."
  npx vercel@latest --prod --yes --name takca && \
    echo "✅ Vercel 배포 완료!" || echo "⚠️  Vercel 배포 실패"
fi

# ── 3. 안내 ──────────────────────────────────
echo ""
echo "[ 3/3 ] Supabase service_role 키 설정"
echo ""
echo "👉 1. 아래 URL에서 service_role 키 복사:"
echo "   https://supabase.com/dashboard/project/ahtziazykzmoxrjzmwmh/settings/api"
echo ""
echo "👉 2. Vercel 환경변수에 추가 (SUPABASE_SERVICE_ROLE_KEY):"
echo "   https://vercel.com/manabouttowns-projects/takca/settings/environment-variables"
echo ""
echo "👉 3. Toss 운영키 설정 시 아래 두 키도 교체:"
echo "   TOSS_SECRET_KEY, NEXT_PUBLIC_TOSS_CLIENT_KEY"
echo ""
echo "========================================"
echo "  완료! CRON_SECRET도 Vercel에 추가하세요"
echo "  예: CRON_SECRET=takca_cron_2026"
echo "========================================"
echo ""
read -p "엔터를 누르면 종료..."
