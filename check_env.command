#!/bin/bash
cd ~/Desktop/탁카
echo '=== Vercel 환경변수 목록 ==='
vercel env ls 2>&1
echo ''
echo '=== Supabase Auth URL 설정 필요 ==='
echo 'https://supabase.com/dashboard/project/ahtziazykzmoxrjzmwmh/auth/url-configuration'
echo ''
echo '추가 URL 설정:'
echo 'Site URL: https://takca.vercel.app'
echo 'Redirect URLs: https://takca.vercel.app/**'
echo ''
read -p '엔터 종료...'
