#!/bin/bash
set -e
cd ~/Desktop/탁카

echo "=== Vercel 환경변수 업데이트 ==="
echo "https://takca.vercel.app" | vercel env add NEXT_PUBLIC_APP_URL production --force
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodHppYXp5a3ptb3hyanptd21oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgxNTIyNywiZXhwIjoyMDk1MzkxMjI3fQ.w4M7H0WKPSR7y6imKq9ZnhmHdWggEVrxmlObVFuaSuo" | vercel env add SUPABASE_SERVICE_ROLE_KEY production --force

echo "=== Git 커밋 ==="
git add -A
git commit -m "feat: fix payment flow, add dispute/fail pages, update service_role" || echo "(nothing to commit)"

echo "=== Vercel 배포 ==="
vercel deploy --prod --yes

echo ""
echo "배포 완료!"
echo "엔터를 누르면 종료..."
read
