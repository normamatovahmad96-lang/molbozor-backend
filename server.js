TASK: Fix backend connection issues and make ads posting + loading work in production.

IMPORTANT RULES:
- Do NOT guess
- Do NOT add demo/mock data
- Do NOT change UI design
- Work ONLY with real backend
- Use production Render backend only

BACKEND (already deployed on Render):
Base URL:
https://molbozor-backend.onrender.com

Backend supports:
GET  /api/elons        → returns array
POST /api/elons        → returns 201 with created item
CORS is enabled

GOALS:
1) Fix ad posting (POST) so it does NOT show "Serverga ulanishda xatolik"
2) After posting, ads must be visible on all devices
3) Bozor feed must load ONLY real data from backend

FRONTEND CHANGES REQUIRED:

A) Posting ads
File:
- app/(tabs)/sell.tsx

Requirements:
- POST to exactly:
  https://molbozor-backend.onrender.com/api/elons
- Send JSON body only:
  {
    title: string,
    price: number,
    description: string,
    phone: string
  }
- Success condition: response.status === 201
- On success:
  - show existing success alert
  - navigate back to Bozor tab
  - trigger refresh so new ad appears immediately
- On failure (network or non-201):
  - show alert text EXACTLY:
    "Serverga ulanishda xatolik. Qayta urinib ko'ring."
- Add console logs:
  - sell_elons_post_start
  - sell_elons_post_response_status
  - sell_elons_post_response_body
  - sell_elons_post_error

B) Loading ads (Bozor feed)
Files:
- app/(tabs)/(home)/home.tsx
- app/(tabs)/(home)/index.tsx

Requirements:
- GET ONLY from:
  https://molbozor-backend.onrender.com/api/elons
- No localhost, no IP, no env fallback
- States:
  - loading → show "Loading..."
  - empty array → show "Hozircha e'lonlar yo'q"
  - fetch error → show "Serverga ulanishda xatolik"
- FlatList keyExtractor:
  - prefer item.id or item._id
- Add console logs:
  - elons_fetch_start
  - elons_fetch_response
  - elons_fetch_payload

C) Demo protection
If any provider or storage exists:
- Remove or ignore ALL demo/mock/static listings
- Never seed demo data
- If persisted old demo data exists, strip it out

EXPECTED RESULT:
- POST works without error
- GET returns real data
- Ads appear instantly after posting
- Same ads visible on other phones/devices
- No demo items ever appear again

Return:
- Only the exact files changed
- Short explanation of why it now works
