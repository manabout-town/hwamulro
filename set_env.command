#!/bin/bash
echo '환경변수 설정 중...'
cd ~/Desktop/탁카

# Add/update env vars on Vercel (production only)
echo "https://ahtziazykzmoxrjzmwmh.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production --force 2>/dev/null || true
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodHppYXp5a3ptb3hyanptd21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTUyMjcsImV4cCI6MjA5NTM5MTIyN30.RrF05mb7zqUSbY0vu1T75l9nRnL6wbSzyzt-KPid9OU" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --force 2>/dev/null || true
echo "https://takca.vercel.app" | vercel env add NEXT_PUBLIC_APP_URL production --force 2>/dev/null || true
echo "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq" | vercel env add NEXT_PUBLIC_TOSS_CLIENT_KEY production --force 2>/dev/null || true
echo "test_sk_D5GePWvyJnrK0W0k6q8gLzN97Eoq" | vercel env add TOSS_SECRET_KEY production --force 2>/dev/null || true
echo "takca_cron_2026" | vercel env add CRON_SECRET production --force 2>/dev/null || true

echo ''
echo '완료! service_role 키는 Supabase 대시보드에서 직접 추가 필요:'
echo 'https://supabase.com/dashboard/project/ahtziazykzmoxrjzmwmh/settings/api'
echo ''
read -p '엔터 종료...'
