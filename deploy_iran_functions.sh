#!/usr/bin/env bash
# Deploy 3 edge function cho Iran dashboard lên Supabase.
# Yêu cầu: đã cài supabase CLI (npm i -g supabase) và đã login (supabase login).

set -euo pipefail

PROJECT_REF="gklpvaindbfkcmuuuffz"

cd "$(dirname "$0")"

echo "==> Linking project $PROJECT_REF"
npx supabase link --project-ref "$PROJECT_REF" || true

echo "==> Deploying fetch-iran-news"
npx supabase functions deploy fetch-iran-news --project-ref "$PROJECT_REF"

echo "==> Deploying fetch-gdelt-iran"
npx supabase functions deploy fetch-gdelt-iran --project-ref "$PROJECT_REF"

echo "==> Deploying build-iran-timeline"
npx supabase functions deploy build-iran-timeline --project-ref "$PROJECT_REF"

echo
echo "Xong. 3 function đã có trên Supabase."
echo "Bước kế tiếp: paste setup_iran_dashboard.sql vào Supabase SQL Editor và RUN."
