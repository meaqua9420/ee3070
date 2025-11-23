# Smart Pet Home (EE3070)

An intelligent IoT system for pet habitats, combining Arduino firmware, a Node.js/Express + TypeScript backend, and a React/Vite + TypeScript PWA frontend. Runs locally over HTTPS/HTTP (ZeroTier friendly) and targets multi‑pet use cases (cat, dog, bird, custom hardware).

## What’s New (Nov 2025)
- Calibration history & rollback: every sensor calibration is versioned; rollback via API.
- Memory relevance scoring: keyword + recency/length/type scoring to trim token usage.
- Developer-mode reasoning & loading phases: clearer AI progress + optional thinking trace.
- Multimodal hardware: 8802B audio amp, ESP32-S3-CAM panel, UV/fan control, feeder fallback when the scale is busy.
- UI / MCP upgrades: slim composer toolbar, attachment tray, MCP palette with recents and status, quick vitals sparklines.
- ESP8266 reliability: safer +IPD reassembly, content-length handling, clean logs.
- Performance: backend esbuild build in ~0.04s; Vite HMR for fast frontend loops.

## Security
- Never commit real secrets. Copy `.env.example` → `.env` (backend) and `.env.local.example` → `.env.local` (frontend). Copy `arduino/.../credentials.h.example` → `credentials.h`.
- Keep secrets out of Git: `.env`, `.env.local`, `credentials.h`, any `*.db`, and uploaded assets.

## Project Structure
```
EE3070/
├── arduino/                  # Firmware (ESP8266/ESP32-S3, sensors)
├── smart-cat-backend/        # Express + TS backend (SQLite, serial bridge, LLM)
├── smart-cat-home/           # React + TS PWA frontend
└── docs/*.md                 # Guides and reports
```

## Quick Start
### Backend
```bash
cd smart-cat-backend
npm install
cp .env.example .env   # fill in API keys, ports, HTTPS certs if needed
npm run dev            # fast dev with ts-node
# or
npm run build && npm start   # esbuild bundle (~0.04s build)
```
Default: `http://localhost:4000` (configure HTTPS via `HTTPS_CERT_PATH/KEY_PATH`, optional HTTP fallback port for ESP).

### Frontend
```bash
cd smart-cat-home
npm install
cp .env.local.example .env.local   # set VITE_API_BASE_URL, VITE_VAPID_PUBLIC_KEY, etc.
npm run dev -- --host --port 5173  # HTTPS by default; remove certs for HTTP
npm run build
```

### Firmware (Arduino / ESP)
- `arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino`
  - Copy `credentials.h.example` → `credentials.h` and fill Wi‑Fi/AP settings.
  - Default pins: UV (D6), Fan (D7); HX711 scale fallback to timed feeding when busy.
- ESP32-S3-CAM: used for snapshots and vision confidence; surfaced in the Camera panel.

## Multi-Pet Support
- Backend `pet_profiles` (CRUD) with `/api/cats` endpoints used by the UI.
- Frontend remembers the last active pet (localStorage). Pet switcher now supports rename and add from the dashboard; per-pet autoset/calibration is respected by the AI.

## Optional Features
- Pro/Ultra models (Nexa/OpenAI/Ollama): configure in backend `.env` and enable auto-upgrade for deeper reasoning.
- Web search: run `search-proxy`, set `GOOGLE_SEARCH_API_KEY`/`CX`, and enable search mode in chat.

## Testing & Validation
- Backend: `npm run typecheck`, `npm test`, or run targeted scripts in `scripts/` / `test-*.sh`.
- Frontend: `npm run build` before PR; use dev server with real backend or mock API.
- Hardware: seed data with `npm run seed:snapshot`; verify ESP8266/ESP32 via dashboard panels (Audio, UV/Fan, Camera, Feeder, Hydration).

## Deployment Notes
- HTTPS + HTTP fallback for embedded devices: set `PORT`, `HOST`, `HTTPS_CERT_PATH`, `HTTPS_KEY_PATH`, and optional `HTTP_FALLBACK_PORT` / `FORCE_HTTPS`.
- ZeroTier: serve HTTPS on 4000 for browsers, HTTP fallback on 8080 for microcontrollers if needed.

## Documentation
- See additional guides in the repo (`IMPLEMENTATION_SUMMARY.md`, `QUICK_START_ZH.md`, `ESBUILD_GUIDE_ZH.md`, `UX_IMPROVEMENTS.md`, etc.) for deeper details on build, performance, UX, and hardware tuning.
