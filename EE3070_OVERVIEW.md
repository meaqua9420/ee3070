# EE3070 Smart Cat Home — System Overview

## Architecture at a Glance
- **Frontend (smart-cat-home)**: Vite + React + TypeScript PWA; dashboards, AI chat, care insights, hardware controls.
- **Backend (smart-cat-backend)**: Express + TypeScript + SQLite; REST API, WebSocket, AI orchestration, hardware command queue.
- **Firmware (arduino/smart_cat_serial_bridge)**: Arduino Mega/UNO + ESP8266 AT; sensors (DHT11/ST021 I²C), HX711 feeder scale, HC-SR04, LDR/FSR, UV/fan relays, hydration pump.
- **AI stack**: Three tiers — Standard (Meme), Pro (PhilIa093), Ultra (Elysia); supports voice TTS, file uploads (PDF/Word), image uploads; MCP tools + online search proxy.

## Frontend Highlights
- Dashboards: Realtime vitals, trends, calibration, alerts.
- Care Command Center & Professional Care Report download.
- AI chat with ComposerToolbar/AttachmentTray for files/images, model tier switch, search toggle, voice playback.
- Hardware panels: Feeder, hydration, UV/fan, audio amp, ESP32-S3 cam monitor.
- Build/dev: `npm run dev -- --host --port 5173` (HTTPS by default), `npm run build`, `npm run preview`; set `SMART_CAT_BASE=./` for mobile/WebView bundles.

## Backend Highlights
- REST endpoints: snapshots, alerts, calibration history/rollback, UV fan state, audio, AI chat/tts, file upload (MIME whitelisted), MCP proxy, camera status/proxy.
- Hardware command queue for ESP8266/serial bridges with ack tracking.
- AI orchestration: model tier selection (auto upgrade), tool calling (MCP + native), search proxy integration, memory relevance scoring.
- Security: API key auth for hardware/admin, Helmet + rate limits, CORS allowlist, upload size/MIME guards.
- Scripts: `npm run dev`, `npm run build`, `npm run seed:snapshot`, test helpers (`test-backend.sh`).

## Database (SQLite)
- Tables: snapshots, alerts, calibration_history, pet_profiles (multi-pet), memories, hardware_commands/results, files, push subscriptions.
- WAL enabled; schema in `smart-cat-backend/src/db.ts`; types in `src/types.ts`.
- New migrations added via `MIGRATIONS` array; keep frontend types in sync (`smart-cat-home/src/types/smartHome.ts`).

## Firmware & Hardware
- Sensors: DHT11 fallback; optional ST021 (4-pin I²C on Mega D20/D21; 3-pin analog version not supported by current driver); HC-SR04, LDR, FSR, HX711 scale, hydration analog.
- Actuators: Feeder servo, hydration pump relay, UV lamp + fan relays, 8002 amp.
- ESP8266: AT firmware, HTTP POST snapshots, fetch hardware commands; baud 115200; credentials in `credentials.h` (never commit).
- Feeder logic: HX711-based smart feed; fallback timed-gate when scale busy/timeout; commands `startFeederCycle/stopFeederCycle/tare/calibrate`.
- Build: Arduino IDE 115200 baud; toggle `ENABLE_*` switches; default DHT pin 24 on Mega.

## AI & Tooling
- Tiers: Meme (fast), PhilIa093 (deeper reasoning), Elysia (ultra). Voice playback available.
- Modalities: text, voice TTS, file (PDF/Word), image uploads.
- MCP tool palette: knowledge search, task status, FS (gated), graph memory, Apple Shortcuts, Codex tasks, analytics, browser/search proxy.
- Online search: backend proxy with filters; opt-in from chat toolbar.

## Ops, Safety, and Testing
- Secrets: do not commit `.env`, `.env.local`, `credentials.h`, SQLite DBs, model files.
- Build checks: `npm run build` (frontend/backend) before PR; firmware compile after pin/toggle changes.
- Upload safety: MIME whitelist, size caps; hardware commands rate-limited; UV/fan polarity flags configurable.
- Mobile/WebView: set `VITE_API_BASE_URL` to reachable host; include ZeroTier/Tailscale origins in CORS.
- Quick sanity flow: backend up + `seed:snapshot` → frontend dev → trigger `/api/chat/suggestions` → hardware command dry-run (feeder fallback visible in logs).

## Known Limitations / Edge Cases
- HX711 accuracy depends on stable power/ground; fallback opens gate if scale timeout.
- Long docs/images may be truncated to fit model context.
- Service Worker/PWA requires HTTPS (or localhost); iOS Safari push unsupported.
- ESP8266 AT has no TLS; use HTTP or LAN/ZeroTier/Tailscale proxying.
