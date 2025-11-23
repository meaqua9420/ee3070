# Smart Pet Home Dashboard (Frontend)

React + Vite + TypeScript PWA for the Smart Pet Home platform. Supports multi‑pet (cat/dog/bird/custom), live sensor data, autoset controls, AI advisor/chat, push notifications, and hardware panels (audio amp, UV/fan, feeder, hydration, ESP32-S3-CAM).

## Highlights
- Realtime dashboard with 24h trends, quick vitals, alerts, AI status, and AI summary.
- AI chat/advisor with model tiers (Balanced/Pro/Ultra), reasoning toggle, web-search mode, file/image uploads, and MCP tool palette (recents + status).
- Hardware panels: audio (8802B), UV/fan, feeder, hydration, ESP32-S3-CAM monitor; Wi‑Fi command queue with ACKs.
- Multi-pet switcher with add/rename, per-pet autoset/calibration, pet preference stored locally.
- Push notifications (VAPID + service worker), custom alert rules, memory vault + favorites, diagnostics (fps/memory, notification troubleshooter).

## Prerequisites
- Backend running at `VITE_API_BASE_URL` (see smart-cat-backend README).
- Node.js 18+ recommended; HTTPS dev certs (`localhost+2.pem/key`) included for PWA/push.

## Setup
```bash
npm install
cp .env.local.example .env.local
# edit .env.local:
# VITE_API_BASE_URL=https://localhost:4000
# VITE_VAPID_PUBLIC_KEY=...
# VITE_REALTIME_WS_URL=wss://localhost:4000/ws  (if backend WS enabled)
# Optional demo mode: VITE_ENABLE_MOCKS=true, VITE_AUTO_DEMO_AUTH=true
npm run dev -- --host --port 5173   # HTTPS by default
npm run build
```
To force HTTP for local testing, temporarily move/rename the `localhost+2*.pem` files and restart dev server (push/PWA need HTTPS).

## Scripts
- `npm run dev` – Vite dev server with HMR.
- `npm run build` – production build (run before PR).
- `npm run preview` – preview build locally.

## Multi-Pet Tips
- Pet switcher supports add/rename; frontend stores last active pet in localStorage.
- Backend `/api/cats` (pet profiles) should return `cats` and `activeCatId`; per-pet settings/calibration flow through to AI/controls.

## UI Notes
- Composer toolbar handles attachments, search toggle, model tier, and send.
- MCP palette has recents/status; tool logs can be filtered (all/hide/tools only).
- Theme presets: auto (day/evening/night) plus manual palettes.

## Troubleshooting
- If chunks 404, clear browser cache/service worker and ensure you’re serving latest `dist/`.
- Push issues: run Notification Troubleshooter in the UI; verify VAPID key and HTTPS.
- Camera/audio panels show “not available” until backend endpoints respond.
