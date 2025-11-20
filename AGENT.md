# Smart Cat Home - AI Agent Configuration

> This file provides context and instructions for AI assistants working with the Smart Cat Home codebase.

## Project Overview

**Type**: IoT Smart Home System for Cat Care
**Course**: EE3070
**Stack**: Arduino (ESP8266) + Node.js + React + TypeScript
**Purpose**: Monitor and manage cat home environment with AI assistance

## System Architecture

### Components

1. **Arduino Firmware** (`arduino/smart_cat_serial_bridge/`)
   - Platform: ESP8266 with AT firmware + Arduino UNO/Mega
   - Sensors: DHT11/ST021, HC-SR04, FSR, LDR, DS3231 RTC
   - Communication: Serial (115200 baud) or WiFi HTTP POST
   - Output: JSON sensor readings every 5 seconds
   - ST021 需 4-pin I²C（SDA/SCL）；若手上是 3-pin 類比版請改掛到類比腳位自行讀值或改回 DHT11，不能用現有 I²C 驅動。HX711 忙碌或秤重逾時時會進入「定時開閘備援」，命令仍回傳成功並標示 `fallback:true`。
   - ⚙️ **Wi-Fi 命令注意事項**：`esp8266HttpRequest()` 依 `Content-Length`、`CLOSED` token 與 `extractJsonPayload` 直接擷取第一段 JSON（即使後面緊接 snapshot 的 `+IPD` 片段也能切割掉）；調整此檔時務必保留這套流程，否則硬體命令會再度卡在 `{"hardwareCommand":"emptyBody"}`。

2. **Backend Server** (`smart-cat-backend/`)
   - Runtime: Node.js 18+
   - Framework: Express 5.x + TypeScript
   - Database: SQLite (better-sqlite3)
   - Features: REST API, WebSocket, AI chat, push notifications
   - Security: Helmet, rate limiting, API key auth

3. **Frontend PWA** (`smart-cat-home/`)
   - Framework: React 18 + Vite
   - Language: TypeScript
   - Features: Real-time dashboard, AI chat with TTS playback, Care Command Center, PWA offline support
   - Themes: Auto (afternoon/dusk/night), afternoon glow, dusk horizon, starlit night
   - New modules: Audio amplifier console, ESP32-S3 camera monitor with live snapshot refresh
   - ✨ 2025.11 更新：AI Chat Compose 區改為 `ComposerToolbar` + `ComposerAttachmentTray`，所有上傳 / 搜尋 / 模型切換與送出按鈕都集中在這兩個元件，並採用 `V2` 設計 tokens（`--color-surface-card`、`--color-border-subtle` 等）；修改聊天輸入相關 UI 時請沿用這些元件與 tokens，而不要直接在 `AiChatPanel` 內嵌樣式。

## Recent Additions (Nov 2025)
- **Calibration history + rollback**：後端新增 `calibration_history` 表與 API：`GET /api/calibration/history`、`POST /api/calibration/rollback/:id`（需 `x-admin-key`），`POST /api/calibration` 會自動寫入歷史。DB/型別在 `smart-cat-backend/src/db.ts`，路由在 `src/index.ts`。前端待補 UI 時請同步型別 `smart-cat-home/src/types/smartHome.ts`。
- **Memory relevance scoring**：`smart-cat-backend/src/ai.ts` 加入 `extractKeywords`、`calculateMemoryRelevance`、`filterRelevantMemories`，依關鍵詞/時間/記憶類型/內容長度排序，僅送最高相關記憶（節省 70–80% token）。除錯可設 `SMART_CAT_AI_DEBUG=true` 檢視篩選結果。
- **AI 進度階段型別**：`LoadingPhase` / `ProgressUpdate` 定義在 `smart-cat-backend/src/types.ts`（`analyzing`、`retrieving_memory`、`searching_knowledge`、`executing_tool` 等）。前端目前用簡化進度條；若要完整實時更新，需在後端補 SSE，前端用 EventSource 接收。
- **Test script**：根目錄 `test-backend.sh` 可快速打新端點（記得填 `.env` 的管理金鑰）；推 PR 前建議先跑。
- **多寵物家居（cat/dog/bird/custom）**：`pet_profiles` 資料表 + CRUD API（`/api/pet-profiles`，需開發者/管理員）；聊天端點可帶 `petProfileId`，`ai.ts` 會把物種的最佳溫濕度/飲水/餵食參數寫入 system prompt。前端在頁首以 `PetTypeSwitcher` 切換、`PetProfileDialog` 新增，`usePetProfile` 會快取並記錄選擇到 localStorage。
- **UI 修復（2025-11-20）**：硬體方案/新增寵物模態改為淺色、加強遮罩，新增寵物對話框置中 + 高度限制（支援捲動），避免被頂部遮擋。若看到舊樣式或載不到 JS，請清除 PWA/Service Worker 和瀏覽器快取，並確認載入最新 build（`index-*.js`、`index-BcOt5gKD.css`）。
- **架構定位**：本專題交付的是「智慧寵物屋軟件平台」原型，貓屋僅作為 reference hardware/demo。後端 API、資料庫 schema、AI 分析/自動控制流程已抽象，可 plug-and-play 不同感測/致動器；切換到狗/鳥/自訂寵物時，只需提供對應 reading payload 與控制工具。
- **2025-11 安全加固（檔案 + 相機）**：
  - `/api/files*` 必須以登入者 `username`（`req.authUser`) 寫入/過濾 `user_id`，一般使用者不得讀/刪/分析他人或 legacy 無 owner 的檔案；開發者角色可全域存取。若新增檔案相關路由請重用相同權限模式。
  - 上傳僅允許白名單 MIME（jpg/png/webp/gif、pdf、mp3/wav/ogg/webm、mp4/webm/ogg、txt/md），可用 `FILE_UPLOAD_MAX_BYTES`（預設 32MB，上限 100MB）控制大小，`JSON_BODY_LIMIT` 需略大於 base64 膨脹後尺寸。
  - 相機輪詢失敗時要清空 `vision.inference/lastEventAt` 並標示離線，避免舊的偵測結果留在 UI；新增相機流程時請保留這個離線重置邏輯。

## 🔒 CRITICAL SECURITY RULES

### Files that MUST NEVER be committed:

```
❌ arduino/smart_cat_serial_bridge/credentials.h
❌ smart-cat-backend/.env
❌ smart-cat-home/.env.local
❌ *.db (SQLite databases)
❌ *.backup files
❌ tmp_payload.json
```

### If credentials are found in committed files:

1. IMMEDIATELY alert the user
2. Recommend rotating ALL credentials (WiFi passwords, API keys, VAPID keys)
3. Suggest using `git filter-branch` or BFG Repo-Cleaner to remove from history
4. Verify .gitignore is properly configured

### Example credentials files should:
- End with `.example` extension
- Contain placeholder values like `YOUR_WIFI_SSID_HERE`
- Be properly documented with comments

## Code Conventions

### TypeScript
- Strict mode enabled
- Type safety enforced (no `any` unless absolutely necessary)
- Interfaces for all data structures
- Function parameter and return types required

### Naming Conventions
- Files: `kebab-case.ts`, `PascalCase.tsx` for React components
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Database tables: `snake_case`

### File Organization
```
Backend:
  src/
    ├── types.ts          # Shared TypeScript types
    ├── db.ts             # Database operations
    ├── ai.ts             # AI/LLM integration
    ├── index.ts          # Express app & routes
    ├── serialBridge.ts   # Arduino communication
    ├── reports.ts        # Professional care report assembly (GET /api/reports/professional)
    ├── utils.ts          # Helper functions
    └── validateEnv.ts    # Environment validation

Frontend:
  src/
    ├── components/       # React components (CareCommandCenter, AiChatPanel, etc.)
    ├── utils/            # Utilities
    ├── types/            # TypeScript types
    ├── data/             # Mock data & API clients
    └── hardware/         # Arduino serial communication
```

### UI Tokens & Composer 溝通
- 介面色彩 / 陰影 / 圓角統一在 `smart-cat-home/src/index.css` 透過 tokens (`--color-surface-card`, `--color-border-subtle`, `--color-accent`…)，新增樣式時請沿用或擴充 tokens，不要直接寫死十六進位色碼。
- `AiChatPanel` 的輸入區由 `ComposerAttachmentTray` 與 `ComposerToolbar` 控制，內含多檔拖曳、單檔附件、搜尋、模型切換（Meme / PhiLia093 / Elysia）與送出按鈕；如需增減功能，請修改這兩個元件，維持工具列一致性。
- `ComposerToolbar` 同時提供模型 dropdown、推理等級（Low / Medium / High）與網頁搜尋地球鈕；其它區域不得再出現第二套模型/推理開關或附件按鈕，避免再次出現「雙欄設定」造成 UI 膨脹。若需顯示狀態提示，改用 `InlineNotice` 或 service badges，而不是重新加入圖塊。
- `useFileUpload` 輸出的檔案預覽應使用 `FilePreviewCard`，附件摘要 pills 則由 `ComposerAttachmentTray` 渲染；避免在其他元件自行刻畫 UI，以免破壞整體風格。

## UV／排風整合（2025-11）
- 韌體會在快照輸出 `reading.uvFan`（`uvOn`, `fanOn`, `autoMode`, `cleaningActive`, `cleaningDurationMs`, `cleaningRemainingMs`, `lastRunIso/Unix`, `nextAutoIso/Unix`, `nextAutoInMs`）。調整欄位時務必同步修改後端 `types.ts` / `utils.ts` 與前端 `types/smartHome.ts`、`useSmartHomeData.ts`。
- 後端硬體命令：
  - 串列模式：`type: "uvFanControl"`，`action` 可為 `setState` / `setAutoMode` / `startCleaning` / `stopCleaning`。
  - HTTP polling 模式：`setUvFanState`、`startUvCleaning`、`stopUvCleaning` 會排入 `hardware_commands` 佇列並由 ESP8266/ESP32 取得。
- REST API：
  - `GET /api/uv-fan/status`
- `POST /api/uv-fan/state`（接受任意組合的 `uvOn`、`fanOn`、`autoMode`）
  - `POST /api/uv-fan/cleaning/start`（可選 `durationMs`，單位毫秒）
  - `POST /api/uv-fan/cleaning/stop`
- **接腳與極性**：韌體已改成使用 D6 控 UV、D7 控風扇，預設 `UV_LAMP_ACTIVE_HIGH=0`、`UV_FAN_ACTIVE_HIGH=0`（低電位導通）；若繼電器是高電位導通記得改為 `1` 後重新編譯。
- 前端透過 `useUvFanControls` + `UvFanControlPanel`（位於 Audio Panel 下方）顯示狀態、開關自動模式、單獨切換 UV / Fan 並啟動/停止清潔。請重用該 hook，避免在其他元件直接呼叫 API。
- **Wi-Fi ACK 回傳**：ESP8266 會在下一筆快照的 `hardwareResults` 陣列中帶回每筆命令的 `id/status/message`，後端會依此標記 `hardware_commands` 為 `completed/failed`。就算 `/api/hardware/commands/:id/ack` 連線失敗，也不會再有命令卡在 `claimed` 狀態。
- `.env` 支援雙端口部署：`PORT` + `HTTPS_CERT_PATH/KEY_PATH` 給 ZeroTier / PWA 走 TLS，同時設定 `HTTP_FALLBACK_PORT`（例如 8080）讓 ESP8266 仍能以 HTTP 匯報。若要完全強制 HTTPS，將 `FORCE_HTTPS=true` 或移除 fallback port。

### 行動裝置 / 推播除錯速查
- Capacitor App 要載入最新 bundle，請以 `SMART_CAT_BASE=./ npm run build && npx cap sync ios` 產生相對路徑資產，並在 Xcode `Product > Clean Build Folder` 後重新安裝。少了 `SMART_CAT_BASE=./` 會讓 WebView 試圖讀取 `/ee3070/...`，直接白畫面。
- `.env.local` 的 `VITE_API_BASE_URL` 必須指向手機可連的 IP（例如 `http://192.168.0.198:4000`），`VITE_API_BASE_URL_MAP` 也要把 `localhost`、`127.0.0.1` 映射到相同 IP，避免登入時打回 Mac 的 localhost。
- 後端 `.env` 的 `ALLOWED_ORIGINS` 需包含 `capacitor://localhost` 與實際的 LAN host，例如 `http://192.168.0.198:5173`。`originMatchesRule` 現已支援 `capacitor://`，重啟後端即可生效。
- 若 iOS 暫時走 HTTP，本地 `Info.plist` 需加入 `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking`，否則請求會被 ATS 擋下。
- **Web Push** 流程：
  1. 以 `npx web-push generate-vapid-keys` 產生金鑰，同步寫入後端 `.env` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) 與前端 `.env.local` (`VITE_VAPID_PUBLIC_KEY`)。
  2. `npm run build`（若供 App 使用請加 `SMART_CAT_BASE=./`）後 `npx cap sync ios/android`，讓 Service Worker 與 `pushNotificationWorker()` 使用最新金鑰。
  3. 在 App 或瀏覽器內開啟「啟用背景通知」，即可透過 `/api/push-subscriptions` 註冊 subscription，之後用 `npm run seed:snapshot` 或 `POST /api/alerts/test` 測試通知。
- **原生 Push (APNs / FCM)**：系統已內建 `native_push_devices` 以及 `NativePushService`。若 `.env` 設 `NATIVE_PUSH_ENABLED=true` 並填入 APNs (`APNS_*`) 或 Firebase (`FCM_SERVICE_ACCOUNT_*`) 憑證，重新啟動後端並在 App 內按一次「啟用背景通知」，就會把 token 寫入資料庫，警示觸發時會同時發出 Web Push 與原生推播。

### ZeroTier + 自簽憑證（跨網測試）
1. **加入 ZeroTier**：在 Mac 執行 `sudo zerotier-cli join <networkId>`，手機裝 ZeroTier One App 並加入同一網路，在 ZeroTier Console 勾選授權後即可取得虛擬 IP（例如 `172.24.87.x`）。
2. **更新 CORS / API 映射**：於 `smart-cat-backend/.env` 的 `ALLOWED_ORIGINS` 和 `smart-cat-home/.env.local` 的 `VITE_API_BASE_URL_MAP` 新增 ZeroTier IP（含 `https://IP:port`），重啟後端、重新 build 前端即可。
3. **產生並套用新憑證**：
   ```bash
   brew install mkcert
   mkcert -install
   mkcert -key-file smart-cat-home/certs/zt.key -cert-file smart-cat-home/certs/zt.pem 172.24.87.11
   ```
   然後在 `.env` 設定 `HTTPS_CERT_PATH=../smart-cat-home/certs/zt.pem`、`HTTPS_KEY_PATH=../smart-cat-home/certs/zt.key`，手機端則需安裝並在「設定 > 一般 > 關於本機 > 憑證信任設定」啟用 `mkcert` 的 rootCA。
4. **重新打包前端**：`SMART_CAT_BASE=./ VITE_ENABLE_PWA=1 npm run build` 後，以 `npx http-server dist --ssl --cert certs/zt.pem --key certs/zt.key --port 4173` 提供 HTTPS 靜態站。iOS 需以 Safari 加入主畫面才能啟用 Web Push。
5. **驗證**：在裝置上開 `https://<ZeroTier-IP>:4000/health` 確認 JSON 正常、再登入 `https://<ZeroTier-IP>:4173`，即可不依賴 LAN/USB 完成登入與推播測試。Android 版 Capacitor App 也需同步上述憑證與 API 網域。

## Smart Care Intelligence Toolkit

- **CareCommandCenter.tsx**：儀表板新模組，會呼叫 `/api/reports/professional` 取得後端產生的專業照護報告，顯示重點指標、行動建議、後續追蹤與社群資源。支援一鍵下載 JSON 報告。
- **reports.ts（backend）**：根據最新快照、歷史資料與警報產生 `ProfessionalCareReport`。若需要擴充欄位（例如多貓家庭），記得同步更新前端型別與 UI。
- **speech.ts（backend）**：封裝 Hugging Face `Xenova/xtts-v2` 文字轉語音管線與 WAV 封裝，提供 `/api/ai/tts` 給前端使用，支援語系/聲線參數與速率限制。
- **RealtimeQuickVitals.tsx**：儀表板右側新增「即時狀態卡」，會將最新快照與最近 16 筆歷史資料合併成 sparkline。每張卡片含溫濕度、飲水/水位、亮度與貓咪在家狀態，並以 tooltip 說明資料來源、警示閾值（例如 28°C/31°C）與採樣筆數，方便工程師檢查感測資料是否連續。
- **useAiVoicePlayback.ts / useServerSpeechSynthesis.ts** + `AiChatPanel`：聊天面板新增語音播放/停止按鈕與「文字 / 語音」模式切換；語音模式會自動呼叫後端 TTS、依 UI 語言選擇中文／英文聲線，並記錄模式到 localStorage，若停用或逾時則退回瀏覽器 Web Speech API。
- **Community resources**：`CareCommandCenter` 內建補水策略、營養日誌、互助論壇連結，未來可改為動態載入或接入官方社群 API。
- **Adaptive AI Model Tiers**：後端支援「平衡（standard）」與「專業（pro）」本地模型，會依使用者請求自動升級或由前端切換。回應 JSON 會回傳 `modelTier`，便於 UI 顯示標章與診斷紀錄。
- **Persona-aware system prompt**：每個模型層級都有專屬代號並寫入 system prompt——Standard = `Meme`、Pro = `PhiLia093`、Ultra = `Elysia`。AI 只有在使用者明確詢問「你是誰」或要求自我介紹時才會講出代號，其餘時間保持專注於照護回覆。
- **User-requested web search**：若聊天訊息含「上網查 / search the web」等關鍵詞，後端會自動開啟 `enableSearch`（必要時將模型切至 Pro）並在 system prompt 中提示 AI 優先呼叫 `searchWeb` 工具；若搜尋被停用就要告訴使用者啟用方式。
- **Developer Reasoning Reveal**：以 `developer` 身分登入時，AI 對話回應會額外附帶 `developer.thinking` 與 `developer.guidance` 欄位（後端 `/api/chat/suggestions`）。前端僅在開發者模式顯示展開式框，方便檢閱模型推理軌跡並記錄防禦/效能改進建議；一般使用者仍只見最終回覆。
- **Audio & Vision Hardware Control**：AI 現可直接呼叫後端工具 `playAudioPattern` / `stopAudioPlayback` / `refreshCameraStatus`。對應流程：
  - `/api/audio/*` 端點可驅動 8802B 功放；若硬體離線，前端 `useAudioControls` 會退回瀏覽器 Web Audio 播放 lo-fi / 貓叫音效，仍可示範呼喚行為。
  - `CameraMonitorPanel` 已整合 ESP32-S3 控制：同一面板可設定本地 URL、自動刷新並觸發快照；`refreshCameraStatus` 工具可同步更新後端 Vision 狀態與快照。
  - ESP32-S3 CAM 仍可透過 `POST /api/camera/events` 回報偵測結果；AI 讀取 `reading.vision.inference` 決策「貓咪是否在鏡頭內」並提示操作。
- **ESP32-S3 CAM STA + HTTPS 代理注意事項**：
  1. **相機務必轉為 STA 模式**：若一直使用預設 AP（`HW_ESP32S3CAM`，IP `192.168.5.1`），後端機器需要改連該 AP，ZeroTier 連線會中斷，`https://172.24.87.11/camera-proxy/...` 也就失效。依官方頁面在 `http://192.168.5.1` 切換至 “STA Settings”，輸入家用 Wi-Fi SSID/密碼或在程式碼中 `WiFi.mode(WIFI_STA); WiFi.begin(...)`，讓相機取得家用網路的 IP（例如 `192.168.0.150`）。
  2. **後端 `.env`**：`CAMERA_BASE_URL` 一定要指向相機實際的 LAN HTTP URL；設定 `CAMERA_PUBLIC_SNAPSHOT_URL` / `CAMERA_PUBLIC_STREAM_URL` 為 ZeroTier HTTPS（預設 `https://172.24.87.11/camera-proxy/...`），重啟 backend 後 `/api/camera/status` 會回傳這兩條公開網址，前端才不會再直接連 HTTP 相機。
  3. **代理失敗排查**：`camera-offline / fetch failed` 表示 backend 打不到 `CAMERA_BASE_URL`。直接在伺服器上執行 `curl http://<camera-ip>/snapshot.jpg`；若成功，再確認 `.env` 是否更新並重新啟動。若瀏覽器 console 仍看到 `http://192.168.x.x` 被 block，代表 backend 尚未重啟（仍回舊 URL）。
  4. **前端資源 404**：若提示 `Importing a module script failed` 或 `BehaviorProfileCard-*.js 404`，表示 `npx http-server dist ...` 仍在供應舊 bundle。重新 `npm run build` 前端並重啟 http-server，確保新的 camera proxy UI 已包含。

## Dataset generation for fine-tuning

- `smart-cat-backend/scripts/generate-pro-dataset.mjs` 會產生 **500 筆中文＋500 筆英文** 的 Pro 專業對話樣本，涵蓋環境調整、補水藥品、行為衝突、出差巡檢、感測器校正、緊急應變與能源最佳化等多種場景。內容透過固定亂數種子產生，可重現並擴增。
- 執行 `node smart-cat-backend/scripts/generate-pro-dataset.mjs` 後會更新：
  - `smart-cat-backend/datasets/pro-finetune/smart-cat-pro.jsonl`（1000 行）
  - 切分檔 `train.jsonl` (900)、`valid.jsonl` (60)、`test.jsonl` (40)、`val.jsonl` (100)
  - Hugging Face 友善格式 `train_hf.json` / `val_hf.json`
- 若重新訓練 LoRA，請先跑上述指令，再呼叫 `smart-cat-backend/scripts/convert_jsonl_to_hf.py` 以確保資料同步。

## AI 模型選擇與自動升級

- **環境變數**（`smart-cat-backend/.env`）：
  - `LOCAL_LLM_MODEL_ID` / `LOCAL_LLM_SERVER_MODEL` / `LOCAL_LLM_SERVER_URL`：標準模型（預設 Nexa 18181）。
  - `LOCAL_LLM_PRO_MODEL_ID` / `LOCAL_LLM_PRO_SERVER_MODEL` / `LOCAL_LLM_PRO_SERVER_URL`：專業模型，可指向 MLX 服務（例如 `http://127.0.0.1:18182`）。
  - `LOCAL_LLM_ALLOW_AUTO_UPGRADE=true`：允許後端根據提問長度、關鍵字或高風險洞察自動升級到 Pro。
  - `LOCAL_LLM_AUTO_UPGRADE_MIN_LENGTH=140`：自動升級字數門檻（原 260，針對 Pro 需求調整為較易觸發）。
  - `SMART_CAT_AI_DEBUG=true` 可在後端 log 中輸出 `modelTier` 決策與理由，便於除錯。
  - 其餘 `LOCAL_LLM_PRO_*` 參數可調整溫度、top-p、timeout 等推論設定。
- **後端邏輯**：
  1. 若前端指定 `modelPreference=pro`，直接使用 Pro；若指定 `standard` 則鎖在平衡模型。
  2. `modelPreference=auto` 時會檢查：「專業/深入」關鍵字、訊息長度、高風險洞察等條件，自動升級。
  3. 若 Pro 模型失敗，會記錄警告並回退平衡模型，`modelTier` 仍標示為 `standard`。
- **前端 UI**：
  - `AiChatPanel` 新增 Smart/Balanced/Expert 切換鍵，狀態會儲存在 `localStorage`（`smart-cat-model-pref`）。
  - 會以徽章顯示當前回覆來源：`Source: Local model` / `Source: Local model · Pro`，成功自動升級時顯示提示訊息，若 fallback 也會在提示中說明。
  - 呼叫 `fetchChatSuggestions` 時附上 `modelPreference`，後端回應的 `modelTier` 會保存於訊息 metadata。
  - 🔍 聯網搜尋按鈕在 Standard 模式會自動切換到 Pro 並顯示提示；Ultra 模式按鈕可點擊但會回覆「Ultra 暫不支援搜尋」的明確警示。

> **開發提醒**：若日後改用雲端或其他供應商，大多只需更新 `LOCAL_LLM_PRO_*` 與 `LOCAL_LLM_SERVER_*` 設定，程式碼會自動拉新模型。

## Model Context Protocol (MCP)

- **Local MCP server**：預設由 `smart-cat-backend` 直接載入 `mcp-tools.json` 並透過 `POST /mcp/invoke` 執行。若要接其他 MCP server，可設定 `MCP_SERVER_URL` 或 `MCP_TOOLS_FILE` / `MCP_TOOLS_JSON`。
- **前端使用方式**：`AiChatPanel` 的 AI MCP 工具面板（同 AI 區塊）說明 `/` 指令 + 分類，亦會自動送出提示要求 AI 主動詢問參數後代為呼叫 MCP。MCP palette 會顯示「最近使用」清單、常用範例與權限徽章（fs write / Codex / browser allowlist）；服務健康度顯示在新的「系統服務」徽章列（後端、語音、MCP、Ultra），並提供內嵌狀態條可直接重新整理工具。
- **AI 除錯體驗**：聊天面板新增 4 階段流程（理解需求 → 蒐集上下文 → 執行工具 → 組合回覆）、工具訊息篩選（全部 / 隱藏 / 只看工具）與「工具執行時間軸」最後 6 筆紀錄。當工具/ MCP 執行時會即時寫入 timeline 與來源徽章（感測器、記憶、圖片、MCP），便於工程師追蹤 AI 決策。
- **安全旗標**：
  - `MCP_FS_ALLOW_WRITE=1` 允許 `mcp.fs.write` 修改白名單目錄，否則會回覆 `File write MCP tool is disabled.`。
  - `CODEX_MCP_ALLOW_WRITE=1` 或工具參數 `allowWrite:true` 才能讓 `mcp.runCodexTask` 進入 `workspace-write`/`danger-full-access` 或 `--full-auto` 模式；預設鎖在 read-only sandbox。
  - `MCP_BROWSER_ALLOWLIST` 控制 `mcp.browser.fetchPage` 與 `mcp.browser.search` 可訪問的網域，若搜尋結果不在清單會被濾掉並提示使用者。
- **工具分類**：包含 Graph Memory、Filesystem、Analytics、CDP、Browser、Codex、Shortcuts、Care Ops 等 20+ 工具，並在前端說明卡中加上示例：知識記憶（Neo4j/RedisGraph）、檔案系統（讀寫專案/硬體檔案）、資料科學（統計/回歸/異常）、瀏覽器代理（抓取白名單網站）。
- **Troubleshooting**：可以呼叫 `GET /api/mcp/tools` 確認是否載入；若工具陣列為空或 `enabled=false`，請檢查 `mcp-tools.json` 與上述環境變數。

### Native App Packaging（Capacitor 建議）

行動裝置若需「原生 App」體驗，可利用 Capacitor 將現有 PWA 包裝：

1. 安裝 Capacitor 套件
   ```bash
   cd smart-cat-home
   npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
   npx cap init smart-cat-home com.smartcat.home
   ```
2. 建置前端並同步資產
   ```bash
   npm run build
   npx cap copy
   ```
3. 使用原生 IDE 打開專案
   ```bash
   npx cap open ios      # Xcode
   npx cap open android  # Android Studio
   ```
4. 在 Xcode / Android Studio 中設定：
   - App 名稱、圖示、Bundle ID
   - Push / 相機 / 麥克風等權限描述
   - 目標 iOS/Android 版本與憑證
5. 若需要離線模式，確保 `service worker` 仍可在 `capacitor://localhost` 運作；如需調用原生 API（藍牙、FCM、APNs），可寫 Capacitor Plugin 或改用 React Native WebView。

> 注意：App Store / Play Store 強制 HTTPS，請搭配反向代理或 Tailscale HTTPS；推播需改用 APNs/FCM 憑證。

### MLX LoRA 服務快速啟動

在 Apple Silicon (M 系列) 上可直接使用 `mlx-lm` 作為 Pro 模型推理伺服器：

```bash
# 先進入虛擬環境
source /Users/meaqua/Desktop/EE3070/venv/bin/activate

# 以背景方式啟動 Pro 服務（port 18182）
nohup mlx_lm.server \
  --model /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b \
  --adapter-path /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b-smart-cat-mlx-lora \
  --host 127.0.0.1 \
  --port 18182 \
  --temp 1.0 \
  --top-p 1.0 \
  --max-tokens 2048 \
  >/tmp/mlx-pro.log 2>&1 &
```

搭配 `.env` 中的 `LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18182` 即可讓後端與前端使用 LoRA 微調後的 Pro 模型。專案腳本 `smart-cat-backend/scripts/run_pro_server.sh` 也已改為同樣的參數設定。

### Web Search Proxy（Google Custom Search）

- 後端會向 `SMARTCAT_SEARCH_PROXY_URL` 指定的 HTTP 服務查詢網頁結果，再做主題安全過濾；若服務不可用則回退到內建的照護知識庫。
- 專案提供 `search-proxy/` 範例，可用 Google Custom Search JSON API：
  1. 在 `search-proxy/.env` 設定 `GOOGLE_SEARCH_API_KEY`、`GOOGLE_SEARCH_CX`、`PORT`。
  2. 啟動 `npm install && npm run start`，預設監聽 `http://127.0.0.1:5858/search`。
  3. 在 `smart-cat-backend/.env` 設 `SMARTCAT_SEARCH_PROXY_URL=http://127.0.0.1:5858/search` 後重新啟動後端。
- 開啟搜尋並使用高推理（high）時，聊天回合的 Pro 模型會自動把 token 上限提升至 1000，以輸出完整的搜尋摘要與後續分析。

### MCP 工具整合（Model Context Protocol）

- `smart-cat-backend/src/mcp.ts` 會根據環境變數載入 MCP 工具定義，並將其附加到 `buildToolDefinitions()` 的工具清單，供一般聊天和 Ultra 模式共用。若未指定 `MCP_SERVER_URL`，預設會指向本後端的 `POST /mcp/invoke`。
- `.env` 支援以下設定：
  ```
  MCP_SERVER_URL=http://127.0.0.1:4100/mcp/invoke   # 必填，HTTP bridge（未設定時預設為 http://127.0.0.1:<PORT>/mcp/invoke）
  MCP_API_KEY=optional-secret                       # (選填) 若需要驗證
  MCP_TIMEOUT_MS=20000                              # (選填) 預設 15000
  MCP_TOOLS_FILE=./mcp-tools.json                   # 或 MCP_TOOLS_JSON=... 直接填 JSON
  CODEX_MCP_ALLOW_WRITE=1                           # (選填) 允許 Codex MCP 工具使用 workspace-write / danger sandboxes
  SHORTCUTS_BIN=shortcuts                           # (選填) 指定 macOS shortcuts CLI
  MCP_FS_ROOTS=/Users/meaqua/Desktop/EE3070         # (選填) 允許讀取/寫入的根目錄，逗號分隔
  MCP_FS_ALLOW_WRITE=0                              # (選填) 啟用檔案寫入工具，1 表示允許
  MCP_BROWSER_ALLOWLIST=https://www.cwb.gov.tw      # (選填) 允許瀏覽器代理訪問的網域
  MCP_BROWSER_TIMEOUT_MS=15000                      # (選填) 逾時毫秒數
  MCP_SEARCH_API_URL=http://127.0.0.1:5858/search   # (選填) 外部搜尋 API，未填則使用內建索引
  ```
- 工具描述遵循 OpenAI function-calling 格式，專案附有 `smart-cat-backend/mcp-tools.example.json` 可作為樣板。更新檔案後重新啟動後端即可重新載入。
- 後端會以 `POST MCP_SERVER_URL` 傳送 `{ tool, args }`，期待回應 `{ "ok": true, "output": "..." }` 或任何帶有 `output/result/data` 字串的 JSON。失敗時會標記 `errorCode: 'mcp_error'` 並把錯誤回傳給模型。
- MCP 工具與原生工具共用 `toolEvents`，因此開發者模式可以直接看到執行結果；若 MCP 未設定則自動跳過，不影響現有功能。
- 內建工具：
  - `mcp.searchKnowledgeBase`：查詢照護知識庫並回傳摘要/建議
  - `mcp.fetchTaskStatus`：讀取範例 Care Task 狀態與 time line
  - `mcp.fetchSnapshotRange`：列出一段時間的感測摘要
  - `mcp.listHydrationAnomalies`：列出近幾筆飲水異常
  - `mcp.triggerCalibrationReminder`：排程感測器校正提醒
  - `mcp.syncCareTaskToNotion`：同步任務到外部 Notion/Todo board（示範）
  - `mcp.runCodexTask`：呼叫本機 Codex CLI（`codex exec`）完成指定的程式碼分析/修改任務；若要允許寫檔或 full-auto，需設 `CODEX_MCP_ALLOW_WRITE=1` 或在 tool args 帶 `allowWrite:true`
  - `mcp.listAppleShortcuts`：列出 macOS 系統目前可用的 Shortcuts 名稱
  - `mcp.runAppleShortcut`：執行指定的 Shortcut，支援 `input` 字串
  - `mcp.graph.query` / `mcp.graph.upsert`：以 Neo4j / RedisGraph 模型查詢與寫入長期記憶（貓咪習慣、照護事件）
  - `mcp.fs.list` / `mcp.fs.read` / `mcp.fs.write`：受控白名單的檔案系統瀏覽與寫入（需 `MCP_FS_ALLOW_WRITE=1`）
  - `mcp.analytics.summarize` / `mcp.analytics.regression`：針對感測資料做統計摘要與線性趨勢偵測，支援 Data Science MCP 擴充
  - `mcp.cdp.fetchProfile` / `mcp.cdp.logEvent`：與外部客戶資料平台（Segment/HubSpot）交換飼主偏好、記錄推播事件
  - `mcp.browser.fetchPage` / `mcp.browser.search`：透過瀏覽器 MCP 代理搜尋或抓取允許網域（可搭配 search-proxy 或 playwright MCP）
- 前端（`AiChatPanel`）內建「AI MCP 工具指南」區塊與斜線快捷：
  - 右下輸入框輸入 `/` 會彈出 MCP palette，可用方向鍵選取工具、Enter 進入參數表單、Esc 關閉。
  - palette 內容由 `GET /api/mcp/tools` 取得，會根據 `mcp-tools.json` 自動分類（記憶、檔案系統、資料科學、CDP、瀏覽器、Codex、Shortcuts）。
  - 使用者選了工具後，前端會自動送出「請 AI 幫忙使用此 MCP 工具並先詢問參數」的訊息；模型會接手確認需求並自行呼叫工具，無須手動填表。
  - MCP 狀態提示會顯示「已載入 X 個工具 / 尚未載入」，問題多半出在 `.env` 未正確設定 `MCP_TOOLS_FILE` 或 `MCP_SERVER_URL`。
- 推薦 MCP server（參考 https://github.com/punkpeye/awesome-mcp-servers）：
  Neo4j / RedisGraph 記憶體：`neo4j-mcp-server`、`redisgraph-mcp`，可直接對接 `mcp.graph.*`
  檔案系統：`fs-mcp-server`、`filesystem-tools-mcp`，支援細部目錄白名單
  數據科學：`pandas-mcp`, `polars-mcp`, `datasette-mcp`，可執行 CSV/Parquet 摘要與視覺化
  客戶資料平台 / CRM：`segment-mcp`, `hubspot-mcp`, `salesforce-mcp`，對應 `mcp.cdp.*`
  瀏覽器/自動化：`playwright-mcp`, `browser-use-mcp`, `selenium-mcp`，可與 `mcp.browser.*` 一起運作


## Common Tasks

### Adding a New Sensor

1. **Arduino** (`smart_cat_serial_bridge.ino`):
   - Add sensor reading function
   - Include in JSON payload output
   - Document in comments

2. **Backend** (`src/types.ts`):
   - Update `SmartHomeReading` interface
   - Update validation in `utils.ts`

3. **Frontend** (`src/types/smartHome.ts`):
   - Update type definitions
   - Add display component in `src/components/`
   - Update dashboard layout

### Adding an AI Tool

1. **Backend** (`src/ai.ts`):
   - Add to `AVAILABLE_TOOLS` array
   - Implement handler function
   - Add validation

2. **Types** (`src/types.ts`):
   - Update `ChatTool` union type
   - Document in JSDoc comments

3. **Frontend**: Automatically displays tool execution logs

### Modifying Database Schema

1. Create new migration in `src/db.ts` `MIGRATIONS` array
2. Increment migration ID (e.g., `006_new_feature`)
3. Implement `up()` function with SQL
4. Test with fresh database

## Environment Variables

### Backend `.env`
```bash
# Core
PORT=4000
DB_PATH=smart-cat-home.db

# Security (REQUIRED)
HARDWARE_API_KEY=<32-char hex>
ADMIN_API_KEY=<32-char hex> # optional fallback if no developer login is available

# AI (optional)
LOCAL_LLM_SERVER_URL=http://127.0.0.1:18181
OLLAMA_BASE_URL=http://localhost:11434
# Pro tier (optional)
LOCAL_LLM_ALLOW_AUTO_UPGRADE=true
LOCAL_LLM_PRO_MODEL_ID=gpt-oss-20b-GGUF
LOCAL_LLM_PRO_SERVER_MODEL=gpt-oss-20b-GGUF
LOCAL_LLM_AUTO_UPGRADE_MIN_LENGTH=260

# TTS (optional)
ENABLE_TTS=true
TTS_MODEL_ID=Xenova/xtts-v2
TTS_LANGUAGE=en
TTS_SPEAKER_ID=en_female_1

# Push (optional)
VAPID_PUBLIC_KEY=<base64>
VAPID_PRIVATE_KEY=<base64>
```

### Frontend `.env.local`
```bash
VITE_API_BASE_URL=http://localhost:4000
VITE_VAPID_PUBLIC_KEY=<must match backend>
VITE_BACKEND_HEALTH_POLL_MS=60000
```
> 調整 `VITE_BACKEND_HEALTH_POLL_MS`（單位毫秒）即可改變健康狀態輪詢頻率，例如 10000 代表 10 秒刷新一次。前端的管理動作現依賴登入後的 `developer` 權限，無需在 bundle 內存放 `VITE_ADMIN_API_KEY`。
> 若透過 Tailscale 遠端存取，請將 `VITE_API_BASE_URL` 改為 100.x.x.x IP，並在後端 `ALLOWED_ORIGINS` 加入 `<tailscale-ip>:5173`。

### Arduino `credentials.h`
```cpp
#define WIFI_SSID_STR "YourWiFi"
#define WIFI_PASSWORD_STR "YourPassword"
#define BACKEND_HOST_STR "192.168.x.x"
#define BACKEND_API_KEY_STR "<must match backend>"
```

## Testing Guidelines

### Backend
```bash
cd smart-cat-backend
npm run build          # TypeScript compilation
npm run dev            # Development server (tsx watch, auto-reload)
npm run dev:legacy     # Legacy ts-node workflow (fallback)
npm run chat:smoke     # AI chat smoke test
# From repository root:
# bash test-backend.sh  # 快速驗證校準歷史 / UV Fan / Alerts 等新端點（請先在腳本填 x-admin-key）
```

### Frontend
```bash
cd smart-cat-home
npm run build          # Production build
npm run preview        # Preview build
npm run dev            # Development server (HTTPS + PWA)
npm run dev:fast       # HTTP-only hot reload (skips TLS + extra watchers)
```

### Arduino
- Use Arduino IDE Serial Monitor (115200 baud)
- Check JSON output format
- Verify WiFi connection status
- Test sensor readings

## Recent Bug Fixes & Improvements (Oct 2025)

### Memory System Enhancements
1. **Proactive Memory Saving**: AI now autonomously saves important information without explicit "remember" commands
2. **Fixed Detection Bug**: Corrected negative pattern matching that was blocking "can you remember X" commands

### Smart Care Intelligence (Apr 2026)
1. **Professional Care Report**：後端新增 `/api/reports/professional`，彙整溫濕度、飲水、餵食與警報，產出風險分級、行動與追蹤建議。
2. **Care Command Center**：前端引入專屬面板（含社群資源、行動清單、趨勢亮點），並支援一鍵下載 JSON 報告供獸醫或家人使用。
3. **AI 語音播報**：聊天面板加入 TTS 播放/停止按鈕，呼叫 Web Speech API；不存在支援時會顯示提示。
4. **Tailnet Ready**：文件更新 Tailscale 設定，讓不同網路的裝置可以安全存取儀表板與 API。
3. **Better Pattern Matching**: Now distinguishes between questions ("can you remember IF...") and commands ("can you remember my cat's name")
4. **Explicit Confirmations**: AI now confirms memory saves with user-friendly messages

### Pattern Improvements
**Working Commands:**
- ✅ "can you remember my cat call neko?"
- ✅ "remember my cat is 3 years old"
- ✅ "please remember she likes tuna"
- ✅ Natural mentions: "My cat Neko is 3 years old" → AI saves proactively

**Properly Blocked (Questions):**
- ❌ "can you remember if I fed the cat?"
- ❌ "do you remember when we last fed her?"

### Code Locations
- Memory detection: `smart-cat-backend/src/ai.ts` lines 337-436
- System prompt with proactive guidance: lines 2015-2020
- Tool execution: `smart-cat-backend/src/index.ts` lines 1562-1629

## AI Memory System Details

### How Memory Works

**1. Memory Types:**
- `note` - General facts, preferences, observations
- `conversation` - Important dialogue summaries
- `setting` - User preferences and configurations

**2. Memory Loading (Retrieval):**
- Uses TF-IDF + n-gram similarity matching
- Loads top 5 most relevant memories per query
- Considers both question tokens and n-gram overlap
- Location: `src/index.ts` lines 557-635

**3. Memory Saving (Two Methods):**

**A. Heuristic Detection (Fast, Rule-Based):**
```javascript
// Triggers (line 355-386):
'can you remember', 'please remember', 'remember that',
'請記住', '記得', '備忘', etc.

// Negative patterns (blocks questions, line 337-353):
'can you remember if', 'do you remember', 'remember when'
```

**B. AI-Driven (Intelligent, Context-Aware):**
- System prompt instructs AI to call `saveMemory` tool proactively
- AI decides what's worth remembering based on context
- Examples: names, ages, preferences, habits, health conditions
- Location: `src/ai.ts` lines 2015-2018

**4. Memory Display:**
```
Reference memories:
1. [備註] 使用者的貓叫Neko，今年3歲
2. [設定] 偏好溫度設定為24°C
```

### Testing Memory System

```bash
# Check memories in database
cd smart-cat-backend
sqlite3 smart-cat-home.db "SELECT id, type, content FROM memories ORDER BY created_at DESC LIMIT 10;"

# Clear all memories (for testing)
sqlite3 smart-cat-home.db "DELETE FROM memories WHERE source != 'system';"
```

**Test Commands:**
1. "remember my cat is called Neko" → Should save immediately
2. "what is my cat's name?" → Should retrieve and use memory
3. "my cat is 3 years old" → AI should proactively save (if configured)

## Debugging Memory Issues

**Enable debug logs** (already in code at line 2078):
```javascript
console.log('[ai] detectMemorySaveIntent result:', heuristicMemory)
```

**Look for these logs:**
- `[ai] incoming question ...` - User's input
- `[ai] detectMemorySaveIntent result: { type, content }` - Detection success
- `[ai] detectMemorySaveIntent result: null` - Detection failed (check why)
- `[ai] heuristic saveMemory intent detected` - Saving triggered

**Common Issues:**
1. **No tool called**: Check if pattern is in NEGATIVE_PATTERNS (line 337-353)
2. **Memory not retrieved**: Check similarity scoring (may need more keywords)
3. **AI doesn't confirm**: Check system prompt in `buildSystemPrompt()` (line 1993)
4. **Tool executes but no confirmation**: Check TOOL_DESCRIPTION prompts (lines 463-483)

## Known Issues & Limitations

### Arduino
- ESP8266 AT firmware doesn't support HTTPS (use HTTP or reverse proxy)
- WiFi password sent in plaintext via AT commands (use WPA2/WPA3)
- No TLS certificate verification
- UNO 若使用 SoftwareSerial，ESP8266 請接在 D11 (RX) / D12 (TX)，程式內 `ESP8266_RX_PIN=11`、`ESP8266_TX_PIN=12`，避免與伺服馬達（D9）與重置按鍵（D8）衝突導致「按音訊按鈕後其他按鈕失效」。

### Backend
- SQLite not suitable for high concurrency (consider PostgreSQL for production)
- Local LLM requires significant RAM (4-8GB for Qwen3-4B)
- Image analysis can timeout on slower machines

### Frontend
- Service Worker requires HTTPS (or localhost)
- Push notifications don't work on iOS Safari
- Large datasets may slow down charts (implement virtualization if needed)

## Debugging Tips

### Check Logs
```bash
# Backend
npm run dev | tee backend.log

# Arduino
# Open Serial Monitor at 115200 baud
# Look for {"status":"ready","version":"..."}
```

### Common Error Patterns

```javascript
// ❌ BAD: Using 'any' type
const data: any = fetchData()

// ✅ GOOD: Proper typing
const data: SmartHomeSnapshot = fetchData()

// ❌ BAD: Not handling errors
const result = await riskyOperation()

// ✅ GOOD: Error handling
try {
  const result = await riskyOperation()
} catch (error) {
  console.error('[operation] Failed:', error)
  // Handle gracefully
}
```

## Performance Optimization

### Backend
- Use connection pooling (already implemented via better-sqlite3)
- Enable WAL mode for SQLite (already enabled)
- Implement database cleanup/retention policies (configurable)
- Rate limit AI requests (already implemented)

### Frontend
- Use React.memo for expensive components (implemented for charts)
- Implement lazy loading for routes
- Optimize bundle size (code splitting enabled)
- Use SkeletonLoader for better perceived performance

## AI Assistant Guidance

### When reviewing code:
1. Check for hardcoded credentials or API keys
2. Verify TypeScript types are properly defined
3. Ensure error handling is present
4. Check for SQL injection vulnerabilities (use parameterized queries)
5. Verify input validation on all user inputs
6. **Memory patterns**: Ensure negative patterns are specific (e.g., "remember if" not "remember")
7. **Tool confirmations**: AI should explicitly confirm actions to users

### When suggesting changes:
1. Maintain existing code style and conventions
2. Update relevant types/interfaces
3. Consider backwards compatibility
4. Update documentation/comments
5. Suggest tests if applicable

### When debugging:
1. Check environment variables are set correctly
2. Verify .gitignore excludes sensitive files
3. Check CORS configuration for frontend-backend communication
4. Verify API keys match across services
5. Check console/logs for specific error messages
6. **Memory issues**: Add debug logs to `detectMemorySaveIntent()` and check pattern matching
7. **AI behavior**: Check system prompt in `buildSystemPrompt()` for guidance
8. **Tool execution**: Verify tool results are properly formatted and returned to AI

## Resources

- [Node.js Docs](https://nodejs.org/docs/)
- [React Docs](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Nexa AI SDK](https://sdk.nexa.ai/)
- [Arduino Reference](https://www.arduino.cc/reference/en/)
- [ESP8266 AT Commands](https://www.espressif.com/en/support/documents/technical-documents)

## Project Status

- ✅ Core features implemented
- ✅ Security hardening complete
- ✅ Documentation comprehensive
- ✅ PWA support enabled
- ✅ Memory system with proactive saving (Oct 2025)
- ✅ Pattern detection bugs fixed (Oct 2025)
- ✅ AI tool calling improvements (Oct 2025)
- ✅ Calibration history + rollback + memory relevance scoring (Nov 2025)
- ✅ Multi-pet profiles（cat/dog/bird/custom）貫穿 API / UI / AI Prompt
- ✅ UI modal fixes（硬體切換、寵物新增淺色化 + 置中 + 高度限制）
- ⏳ SSE 版 AI 進度推播（前端暫以簡化進度條）
- ⏳ Performance optimization ongoing
- ⏳ Additional sensor support planned

## Recent Changes (October 2025)

### Memory System Overhaul
- **Fixed**: Negative pattern blocking legitimate save commands
- **Added**: Proactive AI memory saving without explicit commands
- **Improved**: System prompts to guide AI behavior
- **Enhanced**: Tool result confirmation messages

### Pattern Matching Fixes
```diff
- 'can you remember'  // Too broad, blocked everything
+ 'can you remember if'  // Specific, only blocks questions
+ 'can you remember whether'
+ 'can you remember when'
```

### Documentation Updates
- Created comprehensive root README.md
- Added AGENT.md for AI assistant guidance
- Updated security warnings across all READMEs
- Added .gitignore to root directory
- Fixed exposed credentials (moved to .backup)

---

**For AI Assistants**: Always prioritize security, type safety, and code clarity when working with this codebase. If unsure about credentials or sensitive data, err on the side of caution and alert the user.

### November 2025 Updates
- 修正 `extractChatCompletionText` 過早呼叫 `stripModelThinking`，導致開發者模式無法取得 reasoning token；現改由呼叫處自行清理推理與最終回答。
- 開發者模式分為兩層：`SMART_CAT_DEV_FORCE_THINKING` 控制是否強制輸出 `<think>`，但就算關閉，開發者帳號仍會於響應中收到 `thinking` 欄位供除錯。
- 修正 `callLocalModel` 只將剝除後的訊息傳給 `separateModelReasoning`，改用原始輸出解析，再在回傳前去除推理段落，避免開發者推理被誤判為缺失。
