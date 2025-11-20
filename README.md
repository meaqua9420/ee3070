# Smart Cat Home - EE3070 Project

> 🐾 An intelligent IoT system for monitoring and managing cat home environments using Arduino, Node.js backend, and React frontend.

## ⚡ 最新更新 (2025.11)

### 🎉 新功能实现（2025-11-03）

#### 1. **校准历史记录系统** ✅
- **自动记录**: 每次传感器校准自动保存历史版本
- **变更追踪**: 记录修改字段、前后值、变更摘要（中英文）
- **版本回滚**: 一键恢复到任何历史版本
- **API 端点**:
  - `GET /api/calibration/history` - 查看历史列表
  - `POST /api/calibration/rollback/:id` - 回滚到指定版本

#### 2. **智能记忆相关性评分** ✅
- **关键词提取**: 自动从用户问题中提取中英文关键词
- **多维度评分**: 综合考虑关键词匹配、时间新近度、记忆类型、内容长度
- **智能筛选**: 只发送最相关的记忆给 AI（减少 80% token 使用）
- **性能提升**: AI 响应更快、更精准

#### 3. **AI 进度提示类型** 📋
- **类型定义**: LoadingPhase（idle, analyzing, retrieving_memory, generating, etc.）
- **前端准备**: 支持未来的实时进度显示
- **当前状态**: 类型系统就绪，可无缝升级到 SSE 实时推送

#### 4. **開發者模式 AI 推理揭示** 🛠️
- **角色感知**: 後端 `/api/chat/suggestions` 依登入角色回傳差異化資料，開發者獲得 `developer.thinking`（模型推理軌跡）與 `developer.guidance`（強化建議提醒），一般使用者則無此欄位。
- **前端展示**: `AiChatPanel` 在開發者模式顯示可展開的推理區塊，預設收合，避免佔據介面但可隨時檢閱。
- **守護重點**: 展示內容僅限內部分析，遵循 jailbreak 防線與搜尋審核規範，協助團隊快速定位安全/體驗問題。

#### 5. **音訊 + 視覺多模態硬體整合** 🔊📷
- **8802B 功放支援**：Arduino 韌體新增音訊指令（呼喚/安撫/警示），後端提供 `/api/audio/status|play|stop|config`，前端儀表板可遠端調整音量或靜音並由 AI 工具觸發播放。
- **ESP32-S3-CAM 管理**：新增 `camera.ts` 代理與事件處理，UI 顯示偵測信心值與即時快照；AI 可透過 `reading.vision` 判斷貓咪是否在畫面並建議刷新影像。
- **AI 多模態互通**：AI 對話在需要時可下發硬體命令（透過硬體佇列或管理端點）呼喚貓咪或請使用者檢查相機畫面，並將結果回寫到快照供 Care Command Center 與報告使用。

### 🧩 UI & MCP 升級（2025-11-09）
- **即時狀態卡 Quick Vitals**：儀表板新增 sparkline 卡片，整合最新快照與最近 16 筆歷史資料，提供溫度、濕度、飲水/水位、亮度與貓咪出入摘要，並以 tooltip 說明資料來源與警示閾值；在手機/平板會自動移到側欄頂端。
- **AI MCP Palette 2.0**：斜線面板加入「最近使用」清單、常用範例與權限徽章（fs write / Codex / browser allowlist），並內建 MCP 狀態列，可直接重新整理 `GET /api/mcp/tools`。Palette 也會紀錄工具歷史，方便快速復用。
- **AI 除錯 Flow**：`AiChatPanel` 提供四階段進度條、工具訊息篩選（全部 / 隱藏 / 只看工具）、資料來源徽章，以及最近 6 筆「工具執行時間軸」，協助開發者追蹤 MCP/原生工具是否成功與其依據。
- **AI Composer V2**：聊天輸入區改為 `ComposerToolbar` + `ComposerAttachmentTray`，整合多檔拖曳、單檔附件、搜尋切換與模型選擇（Meme / PhiLia093 / Elysia）。所有樣式改用新版 tokens（`--color-surface-card`, `--color-border-subtle`, `--color-accent`），請在調整 UI 時沿用這兩個子元件與 tokens，避免直接在 `AiChatPanel` 內嵌樣式。
- **AI Composer 微型工具列（2025-11-11）**：根據設計稿把輸入列收斂成 Apple 風格的細長膠囊，只保留 `+`（附件）、`🌐`（搜尋）、模型與推理 dropdown 以及送出鈕；舊版「模型/推理欄位」完全移除，所有選擇都必須透過工具列完成。Dropdown 增加 `z-index` 與 stacking isolation，確保不會再被 MCP 面板或 Care Command Center 蓋住。

### 🔧 UV／排風整合（2025-11-13）
- **韌體回報 `reading.uvFan`**：Arduino 韌體將 UV 燈 / 排風扇狀態、清潔計時、上次/下次排程都打包到快照。後端 `SmartHomeReading`、資料庫與 AI 快照已對應更新。
- **REST API**：新增
  - `GET /api/uv-fan/status`
  - `POST /api/uv-fan/state`（`uvOn` / `fanOn` / `autoMode` 任選）
  - `POST /api/uv-fan/cleaning/start`（可選 `durationMs`）
  - `POST /api/uv-fan/cleaning/stop`
  - 非序列模式會自動排入 `setUvFanState` / `startUvCleaning` / `stopUvCleaning` 硬體命令佇列。
- **接腳與極性**：韌體預設使用 **D6 控 UV**、**D7 控風扇**，大多數繼電器板為「低電位導通」，因此 `UV_LAMP_ACTIVE_HIGH` / `UV_FAN_ACTIVE_HIGH` 預設為 `0`；若硬體是高電位導通，只需改為 `1` 後重新編譯即可。
- **Wi-Fi 命令完成確認**：ESP8266 除了原本的 `/api/hardware/commands/:id/ack`，現在也會在下一筆快照的 `hardwareResults` 帶回執行情況，後端會自動依此將命令標記為 `completed`，即使 ACK 連線失敗也不會卡在 `claimed`。
- **前端控制面板**：`UvFanControlPanel` 已加入儀表板（位於 Audio Panel 下方），可：
  - 查詢自動模式、UV / Fan 開關、清潔剩餘時間、下一次排程；
  - 啟動/停止清潔、快速 2 分鐘清潔、切換自動模式或單獨控制 UV/Fan。
- **雙端口佈署**：ZeroTier 用戶端可持續走 HTTPS（`PORT=4000` + `HTTPS_CERT_PATH/KEY_PATH`），同時在 `.env` 內設定：
  ```env
  PORT=4000
  HOST=0.0.0.0
  HTTPS_CERT_PATH=certs/zt.pem
  HTTPS_KEY_PATH=certs/zt.key
  HTTP_FALLBACK_PORT=8080
  FORCE_HTTPS=false
  ```
  如此一來 ESP8266/ESP32 仍可透過 HTTP fallback port 回報資料，而 PWA/手機則連 `https://172.24.87.11:4000`。若要完全強制 HTTPS，只需移除 `HTTP_FALLBACK_PORT` 或改設 `FORCE_HTTPS=true`。

### 📡 ESP8266 Wi-Fi 命令穩定性（2025-11-14）
- **多段 `+IPD` 完整重組**：`smart_cat_serial_bridge.ino` 現會依 `Content-Length` 並持續等待 `CLOSED` token，確保大尺寸 HTTP 回應（含多段 `+IPD`）能被完全重組，解決 `{"hardwareCommand":"emptyBody"}`。
- **前綴/換行清理**：`stripIpdPrefixes()` 會移除每段 `+IPD` 的 CR/LF，並在擷取 body 前刪除 `CLOSED`、`OK` 及殘留換行，避免 JSON 被植入 `sta\r\ntus` 等破損字串。
- **直接 JSON 擷取**：韌體現在會從 `rawResponse` 中直接抽出第一個 JSON（以 `extractJsonPayload` 為主、`Content-Length` 為輔），就算 snapshot 立即回傳後續 `+IPD`，硬體命令也能準確解析。
- **預設無 debug 噪音**：修復後已移除先前的 raw log，需要診斷時可暫時加回 `printEscapedJson`，平常運行更乾淨。
- **建議流程**：上傳新版韌體後，序列監看器會印出 `{"firmware":"1.1.3-upload"}`，再透過前端 `UV Fan` / `Audio` 控制即可驗證 Wi-Fi 命令是否順利完成（資料庫 `hardware_commands` 應由 `pending → claimed → completed`）。

### 📚 新增文档
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - 完整实现总结与测试指南
- **[QUICK_START_ZH.md](QUICK_START_ZH.md)** - 中文快速启动指南（包含服务器说明）
- **[test-backend.sh](test-backend.sh)** - 自动化后端测试脚本

### 🚀 後端構建速度提升 **5850 倍**
- **舊方式（TypeScript）**: 3 分 54 秒
- **新方式（esbuild）**: **0.04 秒**
- 使用 `npm run build` 即可享受極速構建

### ⚡ 前端開發體驗提升 **10 倍**
- **HMR（熱模塊替換）已啟用**：代碼修改後立即生效，無需刷新頁面
- **保持應用狀態**：修改時不會丟失表單輸入或對話記錄
- **完全發揮 Vite 性能**：實現毫秒級的代碼更新

### 📚 詳細文檔
- **[ESBUILD_GUIDE_ZH.md](ESBUILD_GUIDE_ZH.md)** - esbuild 完整使用指南
- **[PERFORMANCE_FIXES_ZH.md](PERFORMANCE_FIXES_ZH.md)** - 所有性能修復的詳細說明

---

## 🆕 近期功能小抄（2025-11）
- **通用寵物屋平台（架構主張）**：Smart Cat Home 定位為「智慧寵物屋軟件平台」，貓屋是 reference hardware 與 demo 場景。後端 API / DB schema / AI 分析與自動控制流程皆已抽象，任何寵物類型（狗、鳥、或自訂硬件）只要定義好 reading payload 與控制工具即可 plug-and-play。
- **校準歷史 / 回滾**：`POST /api/calibration` 會自動寫入 `calibration_history`；新增 `GET /api/calibration/history` 與 `POST /api/calibration/rollback/:id`（需 `x-admin-key`），用於檢視與一鍵回到舊版本。假資料可用 `npm run seed:snapshot`。
- **記憶相關性計分**：AI 會先跑關鍵詞抽取 + 多維度打分（關鍵詞、時間、類型、長度），只送最高相關的記憶給模型，可省約 70–80% token。開啟 `SMART_CAT_AI_DEBUG=true` 可在後端 log 查看「篩掉多少筆」。
- **AI 進度階段**：`LoadingPhase` 已在後端型別定義（`analyzing`、`retrieving_memory`、`searching_knowledge`、`executing_tool` 等）。前端暫以簡化版進度條實作，若要完整即時推播可再接 SSE。
- **新 UI / MCP 體驗**：聊天輸入改為 `ComposerToolbar` + `ComposerAttachmentTray`（膠囊工具列），AI MCP Palette 2.0（「最近使用」+ 權限徽章 + 內建狀態列），儀表板新增 Quick Vitals sparkline 卡與 UV Fan / Audio / Camera 面板。
- **多寵物（貓 / 狗 / 鳥 / 自訂）**：後端 `pet_profiles` 資料表 + CRUD API（`/api/pet-profiles`）；聊天可帶 `petProfileId` 讓 system prompt 依物種調整溫濕度/飲水/餵食建議。前端在頁首以 `PetTypeSwitcher` 切換、`PetProfileDialog` 新增配置，選擇記錄於 localStorage。
- **餵食秤重處理**：HX711 預設啟用，但若感測器忙碌或未就緒，韌體會改用定時開閘 `fallback-no-scale`，指令不會被拒；秤重正常時仍依重量邏輯運作。
- **UI 修正（2025-11-20）**：硬體切換 / 新增寵物模態改為淺色、加強遮罩；新增寵物對話框置中並限制高度（供小視窗捲動），避免被頂端遮擋。若仍見舊樣式，請清除 Service Worker 與瀏覽器快取，並確保載入最新 build 的 `index-*.js`/`index-BcOt5gKD.css`。

## 🔒 SECURITY NOTICE

**CRITICAL**: This repository contains example configuration files. Before running:

1. **NEVER commit real credentials** to Git
2. Copy `.env.example` files and rename to `.env` / `.env.local`
3. Copy `credentials.h.example` and rename to `credentials.h`
4. Fill in your actual credentials in the renamed files
5. Verify these files are in `.gitignore` (they should be already)

### Files that must NEVER be committed:
- ❌ `arduino/smart_cat_serial_bridge/credentials.h` (contains WiFi passwords)
- ❌ `smart-cat-backend/.env` (contains API keys)
- ❌ `smart-cat-home/.env.local` (contains API keys)
- ❌ `*.db` files (local databases)

## 📁 Project Structure

```
EE3070/
├── arduino/                  # Arduino firmware for ESP8266/sensors
│   └── smart_cat_serial_bridge/
│       ├── smart_cat_serial_bridge.ino
│       ├── credentials.h.example  ← Copy this to credentials.h
│       └── README.md
├── smart-cat-backend/        # Node.js + Express + TypeScript backend
│   ├── src/
│   ├── .env.example          ← Copy this to .env
│   ├── package.json
│   └── README.md
├── smart-cat-home/           # React + TypeScript frontend (PWA)
│   ├── src/
│   ├── .env.local.example    ← Copy this to .env.local
│   ├── package.json
│   └── README.md
└── UX_IMPROVEMENTS.md        # UX component documentation
```

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd smart-cat-backend
npm install

# IMPORTANT: Create your .env file
cp .env.example .env
# Edit .env and add your API keys

npm run dev         # 快速開發模式（推薦）- 使用 ts-node，幾秒啟動
# 或
npm run build       # 超快速構建（0.04 秒！）- 使用 esbuild
npm start           # 運行構建後的代碼
```

**性能提示**：
- ⚡ **開發時使用 `npm run dev`**：跳過構建步驟，幾秒啟動
- 🚀 **生產構建使用 `npm run build`**：esbuild 只需 0.04 秒（比 TypeScript 快 5850 倍）
- ✅ **提交前運行 `npm run typecheck`**：確保沒有類型錯誤

The backend will run on `http://localhost:4000` (or HTTPS if configured).

#### Optional: enable the Pro (20B) model

If you have a larger Nexa model available (e.g. `gpt-oss-20b-GGUF`) you can let the system auto-upgrade for professional advice:

1. Make sure the model is registered with your Nexa server (`nexa serve …` or `nexa run …`).
2. Edit `smart-cat-backend/.env` and add:

   ```env
   LOCAL_LLM_ALLOW_AUTO_UPGRADE=true
   LOCAL_LLM_PRO_MODEL_ID=gpt-oss-20b-GGUF
   LOCAL_LLM_PRO_SERVER_MODEL=gpt-oss-20b-GGUF
   # Optional tuning
   LOCAL_LLM_AUTO_UPGRADE_MIN_LENGTH=260
   LOCAL_LLM_PRO_MAX_TOKENS=512
   ```

3. Restart the backend. The chat API will now return `modelTier` in its payload (`standard` or `pro`).

Front-end users can still pin the experience to “Balanced” or “Expert” from the chat panel, and Smart mode will auto-escalate when a question is long, mentions professional help, or when high-risk insights are active.

#### Optional: enable web search (Google Custom Search)

網頁搜尋採用代理模式，因此需要額外啟動 `search-proxy` 服務：

```bash
cd search-proxy
npm install

# 設定 API Key / CX（可在 search-proxy/.env 修改）
export GOOGLE_SEARCH_API_KEY=AIza...your_key...
export GOOGLE_SEARCH_CX=your_custom_search_engine_id
npm run start   # 預設會開在 http://127.0.0.1:5858/search
```

## 📷 ESP32-S3 相機：STA 模式 + HTTPS 代理操作

為了在手機 / PWA 端透過 `https://172.24.87.11:4173` 安全顯示相機畫面，需要讓 ESP32-S3 CAM 連上你的家用 Wi-Fi（STA 模式），並由後端代理這支 HTTP 相機。

1. **切換到 STA 模式**  
   - 連上預設 AP（`HW_ESP32S3CAM`／`HiwonderS3F`），開 `http://192.168.5.1` → `STA Settings`，輸入自家 Wi-Fi SSID / 密碼並儲存。  
   - 或直接在 Arduino code 中改為：
     ```cpp
     WiFi.mode(WIFI_STA);
     WiFi.begin("YourWiFi", "Password");
     ```
   - 重啟後，序列埠或設定頁會顯示新的 LAN IP（例如 `192.168.0.150`）。此 IP 必須能被 smart-cat-backend 所在主機 ping/curl 到。

2. **更新後端 `.env`**  
   ```env
   CAMERA_BASE_URL=http://192.168.0.150
   CAMERA_PUBLIC_SNAPSHOT_URL=https://172.24.87.11/camera-proxy/snapshot.jpg
   CAMERA_PUBLIC_STREAM_URL=https://172.24.87.11/camera-proxy/stream
   ```
   - `CAMERA_BASE_URL` 填相機的 LAN HTTP URL；`CAMERA_PUBLIC_*` 則是 ZeroTier 網段的 HTTPS 代理給前端用。  
   - 重啟 backend（`npm run dev` / `npm start`）後，`/api/camera/status` 就會回傳這兩條 HTTPS URL，前端不再直接連 HTTP 相機，避免混合內容。

3. **驗證代理**  
   - 在能連到 ZeroTier 的裝置上打開 `https://172.24.87.11/camera-proxy/snapshot.jpg`，應可看到最新快照。  
   - 若 log 出現 `camera-offline` / `fetch failed`，代表 backend 打不到相機；請在主機上 `curl http://<camera-ip>/snapshot.jpg` 測試，確認 `.env` 寫對並已重啟。  
   - 若瀏覽器 Console 仍顯示 `http://192.168.x.x` 被阻擋，代表 backend 尚未生效（仍回傳舊 URL），請重新啟動服務。

4. **常見誤區**  
   - 把 Mac / iPhone 直接切到 ESP32 的 AP 會斷掉 ZeroTier，自然無法載入 `https://172.24.87.11/...`。務必讓相機加入家用 Wi-Fi，或讓 backend 主機同時擁有二張網卡。  
   - 前端若出現 `Importing a module script failed` 或 `assets/*.js 404`，通常是 `npx http-server dist ...` 還在提供舊 bundle，請重新 `npm run build` 並重啟 http-server。

完成以上設定後，手機 / PWA 端即可透過 HTTPS 代理觀看即時畫面，也能讓 AI 工具的 `refreshCameraStatus` 順利運作。

啟動後在 `smart-cat-backend/.env` 設定：

```
SMARTCAT_SEARCH_PROXY_URL=http://127.0.0.1:5858/search
```

重新啟動後端即可。搜尋功能缺席時後端會改用內建的照護知識庫回覆；啟用後則會從 Google Custom Search 抓取貓咪照護相關結果，並在高推理 / Pro 模式下輸出更長的、條列化的建議。

### 2. Frontend Setup

```bash
cd smart-cat-home
npm install

# IMPORTANT: Create your .env.local file
cp .env.local.example .env.local
# Edit .env.local and add your API keys

npm run dev -- --host --port 5173
```

**性能提示**：
- ⚡ **HMR 已啟用**：代碼修改後立即生效，無需刷新頁面
- 💡 **保持狀態**：修改時不會丟失輸入的資料或對話記錄
- 🎯 **極速開發**：享受毫秒級的代碼更新體驗

The frontend will run on `http://localhost:5173` (or HTTPS if configured).

### 3. Arduino Setup

See [arduino/README.md](arduino/README.md) for detailed hardware setup instructions.

**Important**: Copy `credentials.h.example` to `credentials.h` and fill in your WiFi credentials.

### 4. Remote access via Tailscale (optional)

If you want phones or tablets on a different network to reach the dashboard without exposing it to the public Internet:

1. Install [Tailscale](https://tailscale.com/) on the backend machine (Mac/PC/Raspberry Pi) and log in.
2. Install Tailscale on the devices that will access the app (e.g. phone, tablet) and join the same tailnet.
3. After Tailscale connects, note the backend machine’s 100.x IP (e.g. `100.68.190.103`).
4. Update `.env.local` so the frontend points to that IP:

   ```env
   VITE_API_BASE_URL=http://100.68.190.103:4000
   VITE_API_BASE_URL_MAP=localhost=http://127.0.0.1:4000,100.68.190.103=http://100.68.190.103:4000
   ```

5. In `smart-cat-backend/.env` add the Tailscale origin to `ALLOWED_ORIGINS` (e.g. `100.68.190.103:5173`).

Now any Tailscale-connected device can open `http://100.68.190.103:5173` and use the app securely over the encrypted tailnet.

## 🧠 AI / MCP 使用指南

### Backend 設定
- `MCP_TOOLS_FILE`（或 `MCP_TOOLS_JSON`）指向 `smart-cat-backend/mcp-tools.json`，後端啟動時會自動載入工具定義並暴露 `GET /api/mcp/tools` / `POST /mcp/invoke`。
- 寫入相關權限以環境變數管控：
  - `MCP_FS_ALLOW_WRITE=1` 才能啟用 `mcp.fs.write`；否則工具會回覆 `File write MCP tool is disabled.`。
  - `CODEX_MCP_ALLOW_WRITE=1` 或在 tool args 傳 `allowWrite:true`，`mcp.runCodexTask` 才能切換到 `workspace-write`/`danger-full-access`。
  - `MCP_BROWSER_ALLOWLIST=https://www.cwb.gov.tw,https://www.epa.gov.tw` 用來限制 `mcp.browser.fetchPage/search` 可以觸達的網域；不在清單會直接被拒絕。
- Apple Shortcuts、Graph Memory、資料科學、CDP 等 MCP server 可參考 [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) 列表；只需更新 `mcp-tools.json` 並重啟後端即可。

### 前端操作
- 在 AI 聊天輸入框輸入 `/` 即可開啟 MCP palette，內建：
  - 「最近使用」清單（會記錄於 `localStorage`，方便快速重用）
  - 官方示例（知識庫查詢、檔案/資料科學/瀏覽器等）
  - 權限徽章：提示是否需要 fs write、Codex write 或瀏覽器 allowlist
- 選取任一工具後，前端會自動送出 MCP 專用提示，要求 AI 先詢問參數再代為執行；使用者無須手動輸入 JSON。
- Palette 右上角的 MCP 內嵌狀態列可直接重新整理工具列表，若後端未啟用會顯示警示與排錯指引。

### 模型 Persona 與搜尋意圖偵測
- **Persona**：每個模型層級都有專屬代號並內建於 system prompt——Standard = `Meme`、Pro = `PhiLia093`、Ultra = `Elysia`。AI 只有在使用者明確詢問身份時才會提及名字，日常回覆保持專注於照護內容。
- **搜尋意圖**：若使用者訊息包含「search / 上網查」等關鍵詞，後端會自動啟用 `enableSearch`（必要時強制切換 Pro），並在 prompt 中要求 AI 優先呼叫 `searchWeb`；若搜尋被停用則會回覆啟用方式。

### 除錯技巧
- 聊天面板提供 4 階段流程條（理解需求 → 蒐集上下文 → 執行工具 → 組合回覆）與資料來源徽章（感測器、記憶、圖片、MCP），可快速看到 AI 回覆依據。
- 使用「工具訊息篩選」可以只看工具事件（或隱藏工具），旁邊的「工具執行時間軸」會列出最近 6 筆工具/MCP 成功與失敗狀態，有助於比對後端 log。
- Quick Vitals sparkline 卡片提供感測趨勢與 tooltip，若 AI 或 MCP 應用出現異常，可先確認即時值是否落在預期範圍。

### 5. Hugging Face 語音模型（可選但建議）

若想讓 AI 回覆自動產生自然語音，請啟用後端的 Hugging Face TTS 管線：

1. 在 `smart-cat-backend/.env` 保持 `ENABLE_TTS=true`，可依需求調整：
   ```env
   ENABLE_TTS=true
   TTS_MODEL_ID=Xenova/xtts-v2
   TTS_LANGUAGE=en # 支援 en、zh、ja...，亦可由前端動態指定
   TTS_SPEAKER_ID=en_female_1
   ```
2. 首次呼叫 `/api/ai/tts` 會自動從 Hugging Face 下載模型（約 400 MB），緩存於 `~/.cache/huggingface/transformers`。下載過程需要網際網路存取，之後即可離線使用。
3. 可手動暖機避免第一次點擊時等待，可在後端目錄執行（將 `${ADMIN_API_KEY}` 改為 `.env` 裡的管理密鑰）：
   ```bash
   npm run dev
   curl -X POST http://127.0.0.1:4000/api/ai/tts \
     -H "Content-Type: application/json" \
     -H "x-smartcat-admin: Bearer ${ADMIN_API_KEY}" \
     -d '{"text":"Smart Cat Home 語音測試","language":"zh"}'
   ```
4. 前端已自動帶上 `x-smartcat-admin` 標頭；若後端停用 TTS 或請求失敗，按鈕會改用瀏覽器 Web Speech API 播放備援語音。

## ✨ Key Features

- 📊 **Real-time Monitoring**: Temperature, humidity, water level, cat weight, ambient light
- 🤖 **AI Assistant**: Local LLM integration (Nexa/Qwen) for health recommendations
- 🧠 **Adaptive Model Tiers**: Smart/Balanced/Expert modes with auto-upgrade to `gpt-oss-20b-GGUF` when deeper care advice is needed
- 💬 **Chat Interface**: Interactive AI conversation with tool calling capabilities
- 🔊 **Conversational TTS**: 一鍵播放 AI 回覆，優先使用 Hugging Face 語音模型並自動切換瀏覽器備援，會依介面語言播放中文或英文語音
- 🧠 **Smart Care Intelligence**: 新增專業照護報告、重點指標、行動建議與社群資源
- 🔔 **Push Notifications**: Web Push API with VAPID for alerts
- 📱 **PWA Support**: Install as mobile/desktop app
- 🛡️ **Security**: Hardware API keys, admin authentication, rate limiting
- 🌐 **Multi-language**: Chinese/English interface
- 📈 **Historical Data**: 24-hour trends and CSV export
- ⚙️ **Auto-calibration**: Sensor calibration through UI
- 🎨 **Multiple Themes**: Morning blue, dark mode, forest green

## 🧠 Smart Care Intelligence

- **Care Command Center**：儀表板新增專區，彙整 AI 產出的「專業照護報告」、即時風險燈號、行動建議與後續追蹤項目，支援一鍵下載 JSON 報告（給獸醫或照護夥伴）。
- **AI Professional Report API**：後端提供 `GET /api/reports/professional`，依據最新快照、趨勢與警報自動生成專業摘要、重要指標與照護建議。
- **Community Hub**：整合常用補水策略、營養日誌模板與國際飼主論壇連結，建立互助與經驗分享的入口。
- **AI 語音播報**：聊天面板提供「文字 / 語音」模式切換；開啟語音模式時會自動呼叫後端 Hugging Face `Xenova/xtts-v2` 生成語音，並依 UI 語系自動選擇中文或英文聲線，伺服器停用時自動退回瀏覽器 Web Speech API。
- **Model Tier Toggle**：聊天面板新增 Smart / Balanced / Expert 三段切換，會顯示目前回覆使用的模型（含自動升級或 fallback 提示），偏好會儲存在瀏覽器端。

## 🏗️ Architecture

```
┌─────────────┐      WiFi/Serial      ┌──────────────┐      HTTP/WS       ┌─────────────┐
│   Arduino   │ ──────────────────────▶│   Backend    │◀──────────────────▶│  Frontend   │
│  ESP8266    │   JSON sensor data     │  Node.js +   │   REST API +       │  React +    │
│  Sensors    │                        │  Express +   │   WebSocket        │  Vite PWA   │
│  (DHT11,    │                        │  SQLite      │                    │             │
│   HC-SR04,  │                        │              │                    │             │
│   FSR, etc) │                        │              │                    │             │
└─────────────┘                        └──────────────┘                    └─────────────┘
                                            │
                                            ▼
                                       ┌─────────┐
                                       │ SQLite  │
                                       │ Database│
                                       └─────────┘
```

## 🔧 Tech Stack

### Arduino
- **Platform**: ESP8266 AT firmware + Arduino UNO/Mega
- **Sensors**: DHT11/ST021 (temp/humidity), HC-SR04 (ultrasonic), FSR (weight), LDR (light), DS3231 (RTC)
- **Communication**: Serial (115200 baud) or WiFi HTTP POST

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express 5.x
- **Language**: TypeScript
- **Database**: SQLite with better-sqlite3
- **Security**: Helmet, rate limiting, API key authentication
- **AI**: Nexa AI, Ollama, OpenAI (optional)
- **Push**: web-push (VAPID)

### Frontend
- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **PWA**: Service Worker with offline support
- **Styling**: CSS modules with theme system
- **Charts**: Custom canvas-based rendering
- **Build**: Optimized with tree-shaking and code splitting

## 📖 Documentation

- [Arduino Hardware & Firmware Guide](arduino/README.md)
- [Backend API Documentation](smart-cat-backend/README.md)
- [Frontend Development Guide](smart-cat-home/README.md)
- [UX Components Reference](UX_IMPROVEMENTS.md)
- **[esbuild 使用指南](ESBUILD_GUIDE_ZH.md)** ⚡ 新增
- **[性能優化總結](PERFORMANCE_FIXES_ZH.md)** ⚡ 新增

## 🔐 Security Best Practices

### Before Deployment

1. ✅ **Change all default API keys** in `.env` files
2. ✅ **Use strong, unique passwords** for WiFi credentials
3. ✅ **Enable HTTPS** in production (use reverse proxy or self-signed certs for development)
4. ✅ **Configure CORS** to allow only trusted origins
5. ✅ **Enable rate limiting** (already configured, but adjust as needed)
6. ✅ **Regular updates**: Run `npm audit` and `npm update` regularly
7. ✅ **Monitor logs**: Check for unauthorized access attempts
8. ✅ **Backup database**: SQLite database in `smart-cat-backend/smart-cat-home.db`

### File upload & media safety
- 所有 `/api/files*` 路由現在以登入者 `username` 對應的 `user_id` 讀/寫；一般使用者無法查看或刪除他人檔案，開發者角色才有全域存取。新增路由時請重用同樣的擁有權檢查模式。
- 僅允許白名單 MIME（jpg/png/webp/gif、pdf、mp3/wav/ogg/webm、mp4/webm/ogg、txt/md）；其它型別會被拒絕。上傳大小可用 `FILE_UPLOAD_MAX_BYTES` 調整（預設 32MB，硬上限 100MB），`JSON_BODY_LIMIT` 需略大於 base64 膨脹後的大小。
- 解析 Base64 前即先估算大小並拒絕超限，避免在解碼階段耗盡記憶體；批次上傳時先全數驗證再寫入，避免部分成功造成難以對帳。

### Camera health
- 相機輪詢/快照失敗時會清空 `vision.inference` 與 `lastEventAt` 並標記離線，前端不再保留舊的偵測結果；新增相機邏輯時請保留這個離線重置行為。

### Recommended API Key Format

Generate strong API keys:
```bash
# Generate a random 32-character hex key
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Use the same key in:
- Backend: `HARDWARE_API_KEY` in `.env`
- Arduino: `BACKEND_API_KEY_STR` in `credentials.h`

## 🐛 Troubleshooting

### Arduino doesn't connect to WiFi
1. Check `credentials.h` - verify SSID and password
2. Ensure ESP8266 is powered with 3.3V (not 5V!)
3. Check baud rate matches (default 115200)
4. Monitor Serial output for AT command responses

### Backend returns 401 Unauthorized
- Ensure API keys match between backend `.env` and frontend `.env.local`
- Check `HARDWARE_API_KEY` matches Arduino `BACKEND_API_KEY_STR`

### Frontend can't connect to backend
- Verify `VITE_API_BASE_URL` points to correct backend URL
- Check CORS origins in backend `.env` (`ALLOWED_ORIGINS`)
- If using HTTPS, ensure certificate is trusted

### Push notifications don't work
- Only works on HTTPS or `http://localhost`
- Generate VAPID keys: `npx web-push generate-vapid-keys`
- Ensure keys match in backend `.env` and frontend `.env.local`

## 📝 Development Notes

### Adding New Sensors

 1. Update Arduino `.ino` to read sensor and add to JSON payload (Mega 版 DHT11 預設接 D24；UNO 請改 `DHT_PIN=4` 並接 D4)
2. Update `SmartHomeReading` type in `smart-cat-backend/src/types.ts`
3. Update frontend display in `smart-cat-home/src/components/`

### Adding New AI Tools

1. Define tool in `smart-cat-backend/src/ai.ts` (`AVAILABLE_TOOLS`)
2. Implement handler in the same file
3. Update `ChatTool` type in `types.ts`
4. Frontend will automatically display tool executions

## 🤝 Contributing

This is an academic project (EE3070). For bug reports or suggestions:

1. Ensure sensitive data is removed
2. Provide clear reproduction steps
3. Include system information (OS, Node version, etc.)

## 📄 License

This project is for educational purposes (EE3070 course project).

## ⚠️ Disclaimer

This system is for educational and personal use. Not recommended for critical applications without additional security hardening and testing.

---

**Last Updated**: October 2025
**Course**: EE3070
**Status**: ✅ Active Development
