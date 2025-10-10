# Repository Guidelines

## Project Structure & Module Organization
- `pkm-frontend/` hosts the Vite + React + TypeScript app; core UI logic lives under `src/` with feature components grouped by page (e.g., `src/components`, `src/hooks`, `src/utils`).
- `pkm-frontend/examples/arduino/` contains Arduino firmware such as `smart_cat_home.ino`, mirroring serial protocols used by the frontend.
- `pkm-frontend/fine-tune-qwen3/` stores notebooks, datasets, and scripts supporting LoRA merge/convert flows.
- `scripts/` holds automation entry points (deployment, LLM servers). Treat these as executables, not shared libraries.

## Build, Test, and Development Commands
- `cd pkm-frontend && npm install` installs or updates frontend dependencies.
- `npm run dev -- --host --port 5180` launches the Vite dev server; adjust the port when 5173 is occupied.
- `npm run build` produces a production bundle under `pkm-frontend/dist/` and fails on TypeScript errors.
- `npm run serve:local` serves the built assets at `http://localhost:8080` for manual QA.

## Coding Style & Naming Conventions
- Use functional React components with hooks, two-space indentation, and TypeScript types/interfaces.
- Component files follow `PascalCase`, utilities `camelCase`, and route paths `kebab-case`.
- Prefer colocated styling via Tailwind tokens or the existing design system; keep data access isolated in `utils/` and side effects within `useEffect`.
- Run `npm run lint` (if configured) before pushing to ensure ESLint and formatting rules pass.

## Testing Guidelines
- Baseline verification requires `npm run build` plus a manual walkthrough of Pet Monitor, Smart Cat Home, and CityU AI flows.
- Add optional Vitest specs under `src/**/__tests__/` with filenames ending in `.test.tsx` or `.test.ts`.
- Document reproduction steps and console output when modifying serial or LLM integrations.

## Commit & Pull Request Guidelines
- Use short, imperative commit messages such as `Add autoset profile telemetry`.
- PR descriptions must outline purpose, scope, and testing evidence (command logs, device/browser notes); attach screenshots for UI changes.
- Reference related issues, avoid bundling unrelated refactors, and never commit built `dist/` assets or model weights.

## Security & Configuration Tips
- Store sensitive runtime config in `pkm-frontend/.env.local` (e.g., `VITE_CITYUAI_*` keys).
- Keep GGUF weights and fine-tune artifacts outside the repo; share paths privately.
- Verify AI endpoints：若使用客製後端，透過 Network tab 確認 `VITE_API_BASE_URL`；若使用 Ollama，設定 `VITE_OLLAMA_BASE_URL`（建議經 HTTPS 代理）與 `VITE_OLLAMA_MODEL`，並在 `/etc/hosts` 加上對應 DNS（例如 `127.0.0.1 ollama.local`）。
- 必須配置 `VITE_API_BASE_URL` 與 `VITE_VAPID_PUBLIC_KEY`，否則語言同步、通知與 AI 對話會降級為提示而不執行。
- 若未實作 `/api/chat/suggestions`，請提供 HTTPS 可存取的 Ollama；否則前端無法呼叫聊天 API。
- Web Serial 僅在 HTTPS（或 localhost）下運作，請透過 `mkcert` 或其他憑證方案啟動 Vite，並在 Arduino 韌體實作 `PING`/`PONG` 以配合設備檢測面板。

## Hardware & Backend Integration
- Firmware: Arduino + ESP8266/ESP32 should publish sensor JSON to your backend (e.g., `POST /api/snapshots`) and poll for autoset settings (`GET /api/settings`).
- Backend: implement `POST /api/preferences/language`, `POST /api/push-subscriptions`, `POST /api/equipment/test`, and `GET /api/snapshot/latest`; store subscriptions with language and configure VAPID private/public keys for push.
- Frontend wiring: replace `mockApi.ts` with real endpoints, update `testEquipmentConnection` to call `/api/equipment/test`, and verify `.env.local` contains the deployed API/VAPID values before running `npm run dev` or `npm run build`.
