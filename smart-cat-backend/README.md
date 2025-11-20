# Smart Cat Home Backend (Local)

這個目錄提供一個簡單的 Express + TypeScript 後端，會：

- 接收 Arduino 感測資料（HTTP 或序列埠）並儲存到 SQLite
- 提供給前端最新快照與歷史記錄 API
- 將裝置設定、語系、推播訂閱等偏好寫入資料庫
- 將感測資料與使用者提問整理後串接本地模型（或備援的 Ollama / OpenAI），產生 AI 建議
- 在啟用序列橋時，會把 AI 或使用者更新的 Autoset 設定、感測器校正值即時推送回 Arduino 韌體
- 管理自訂警報規則、聊天收藏、通知修復紀錄並提供診斷報告

## 環境需求

- Node.js 18+
- （選用）Arduino 透過 USB 連接本機，並以 `POST /api/snapshots` 發送 JSON

## 安裝

```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
npm install
# 建議複製環境範例
cp .env.example .env
```

> 💡 伺服器啟動時會自動執行資料庫遷移（`schema_migrations`），建立或調整必要的資料表，如 `alert_rules`、`chat_favorites` 與 `notification_fixes`。首次升級時請保留 `smart-cat-home.db` 以便遷移寫入；若需重頭初始化，可移除舊有資料庫後重新啟動。

## 🔒 安全性 (Security)

本專案已實施以下安全措施（2025.10 更新）：

### 環境變數保護
- **請勿將 `.env` 檔案提交到版本控制系統**
- `.gitignore` 已包含 `.env` 與 `.env.local`
- 建議使用 `web-push generate-vapid-keys` 定期更換 VAPID 金鑰

### 新增的安全功能

1. **Helmet 安全標頭**：
   - 自動設定 HTTP 安全標頭（X-Frame-Options、X-Content-Type-Options 等）
   - 防止常見的網頁攻擊（XSS、點擊劫持等）

2. **速率限制（Rate Limiting）**：
   - 一般 API：每個 IP 每 15 分鐘最多 100 個請求
   - AI 聊天：每個 IP 每 5 分鐘最多 10 個請求
   - 超過限制時回傳 429 狀態碼與錯誤訊息
   - 回應標頭包含 `RateLimit-*` 資訊
   - 伺服器啟動時會呼叫 `app.set('trust proxy', 1)`；若放在 nginx / Cloudflare 後面，記得在代理層補上 `X-Forwarded-For`，即可正確依使用者 IP 套用限制

3. **全域錯誤處理**：
   - 404 路由處理
   - 未捕獲的錯誤會被記錄並回傳通用錯誤訊息（不洩露內部細節）
   - 處理 `unhandledRejection` 與 `uncaughtException`
   - 支援 SIGTERM/SIGINT 優雅關閉

4. **子程序安全**：
   - Python 子程序僅接收必要的環境變數（不包含 API 金鑰）
   - 驗證 `LOCAL_LLM_PYTHON` 路徑，拒絕可疑字元
   - 防止指令注入攻擊
5. **硬體 API 密鑰驗證**：
   - 若 `.env` 設定 `HARDWARE_API_KEY`，`POST /api/snapshots` 會檢查 `Authorization: Bearer <key>`
   - 建議配合 `arduino/credentials.h` 的 `BACKEND_API_KEY_STR` 使用，同步更新即可阻擋未授權設備上傳資料

### 安全最佳實踐

開發時請遵循：
- ✅ 不要在程式碼中硬編碼密鑰或敏感資訊
- ✅ 定期更新依賴套件 (`npm audit` 與 `npm update`)
- ✅ 使用 HTTPS 在生產環境中運行（見 `HTTPS_CERT_PATH` / `HTTPS_KEY_PATH`）
- ✅ 檢查 CORS 設定，只允許必要的來源
- ✅ 監控日誌中的異常活動

### 登入帳號配置

自 2025.11 起，預設不再提供硬編碼帳號。請在 `.env` 中設定下列任一參數：

- `SMARTCAT_AUTH_USERS`：JSON 陣列，格式如 `[{"username":"admin","displayName":"Admin","role":"developer","passwordHash":"$2b$12$..."}]`
- `SMARTCAT_AUTH_USERS_FILE`：指向 JSON 檔案的路徑（絕對或相對於 repo root），內容格式與上方相同

欄位說明：

| 欄位 | 說明 |
| --- | --- |
| `username` | 必填帳號，會自動轉為小寫比對 |
| `displayName` | 顯示名稱，預設同 username |
| `role` | `developer` 或 `user`，未填預設為 `user` |
| `passwordHash` | **必填**的 bcrypt 雜湊；可用 `npx bcrypt-cli "<password>"` 取得 |
| `password` | 可選，若提供純文字密碼，伺服器啟動時會即時轉成 bcrypt hash（建議僅限本機測試） |

若兩者皆未設定，伺服器將拒絕啟動。建議為每位使用者建立獨立帳號，並妥善保存 `.env` 或 JSON 檔案。

## 🛰 Wi-Fi 硬體指令流程（2025.10）

為了讓 AI 或管理者在無序列線的情況下仍能操控裝置，本版新增「硬體指令佇列」。流程如下：

1. **入列**：管理端呼叫 `POST /api/hardware/commands`（需 `x-smartcat-admin: Bearer <ADMIN_API_KEY>`），傳入 `type` 與 `payload`。目前支援 `updateSettings`、`updateCalibration`，成功會回傳指令 ID。
2. **輪詢**：Arduino 韌體每 10 秒向 `GET /api/hardware/commands/pending` 請求指令（需 `Authorization: Bearer <HARDWARE_API_KEY>`）。伺服器回傳待執行指令並標記為 `claimed`，避免重複派發。
3. **處理與回報**：韌體依 `type` 套用設定/校正後，呼叫 `POST /api/hardware/commands/:id/ack` 回傳 `status: "success" | "error"` 及選擇性的訊息。後端會將狀態寫入 SQLite，供診斷或 UI 顯示。
4. **序列後援**：若 `.env` 仍啟用 `SERIAL_ENABLED=true`，原本的序列推送機制保持運作；未啟用時即自動改用 Wi-Fi 佇列。

> ✅ `HARDWARE_API_KEY` 仍用於 Arduino → 後端的命令輪詢。管理端點（設定、校正、音訊/攝影機控制）現在優先信任已登入且具 `developer` 角色的使用者；若沒有登入流程，仍可選擇設定 `ADMIN_API_KEY` 以 Bearer Token 形式存取。

## 🌐 ZeroTier 遠端測試與自簽憑證

開發時若要讓手機或外部裝置連回本機後端，可透過 ZeroTier + `mkcert` 快速建立安全通道：

1. **加入 ZeroTier 網路**  
   - Mac：`sudo zerotier-cli join <networkId>`，ZeroTier Console 勾選授權即可取得虛擬 IP（例：`172.24.87.11`）。  
   - 手機：安裝 ZeroTier One App，輸入相同 Network ID、授權後會拿到同網段 IP。

2. **新增 CORS / API 映射**  
   - `smart-cat-backend/.env` → `ALLOWED_ORIGINS` 加上 `http(s)://<ZeroTier-IP>:5173` / `:4173` 等前端來源。  
   - `smart-cat-home/.env.local` → `VITE_API_BASE_URL` / `VITE_API_BASE_URL_MAP` 指向 `https://<ZeroTier-IP>:4000`，重新 build 讓 bundle 使用新的 API 網址。

3. **產生 ZeroTier 專用憑證**  
   ```bash
   brew install mkcert
   mkcert -install
   mkcert -key-file smart-cat-home/certs/zt.key -cert-file smart-cat-home/certs/zt.pem 172.24.87.11
   ```  
   然後在 `.env` 設定 `HTTPS_CERT_PATH=../smart-cat-home/certs/zt.pem`、`HTTPS_KEY_PATH=../smart-cat-home/certs/zt.key`；手機 / Android 測試機需安裝並信任 `mkcert -CAROOT` 目錄中的 `rootCA.pem`。

4. **重新部署前端**  
   - `SMART_CAT_BASE=./ VITE_ENABLE_PWA=1 npm run build`  
   - 測試靜態站：`npx http-server dist --ssl --cert certs/zt.pem --key certs/zt.key --port 4173`  
   - Capacitor App：跑完 build 後 `npx cap copy android` 或 `npx cap sync ios android`，確保 Web 資產與 HTTPS 設定同步。

5. **驗證**  
   - 用任一裝置打開 `https://<ZeroTier-IP>:4000/health`，若看到 JSON 即代表憑證與路由皆正常。  
   - iOS 需用 Safari →「加入主畫面」才能啟用 Web Push；Android App 則要在裝置上信任相同 CA。  
   - 之後登入 `https://<ZeroTier-IP>:4173`（或 App）即可在任何網路環境下遠端測試推播、AI 與硬體控制。

## 指令

| 指令 | 說明 |
| ---- | ---- |
| `npm run dev` | 使用 **tsx** + esbuild hot reload（啟動<1s，自動重新載入並忽略 `dist/`、`datasets/`、`logs/`） |
| `npm run dev:legacy` | 保留舊版 `ts-node` 啟動方式，若遇到實驗性語法問題可改用此指令 |
| `npm run clean` | 刪除 `dist/`，確保下次建置會重新產出所有檔案（含 AI 模組） |
| `npm run build` | 使用 **esbuild** 快速編譯 TypeScript 到 `dist/`。現在會快取編譯成果，只重建變更檔案（強制全量：`FORCE_FULL_BUILD=1 npm run build`） |
| `npm run rebuild` | 一鍵執行 `npm run clean` + `FORCE_FULL_BUILD=1 node build.mjs`，適合 AI 模組異常時重編 |
| `npm run build:tsc` | 使用傳統 TypeScript 編譯器編譯（慢，約 4 分鐘，但包含類型檢查） |
| `npm run typecheck` | 只執行類型檢查，不生成文件（建議在提交代碼前運行） |
| `npm start` | 執行編譯後的 Node 伺服器 |

## 🔌 MCP 工具整合

後端現在可以把 Model Context Protocol (MCP) 工具注入 `function_call`。設定方式：

1. **環境變數**

   ```env
   MCP_SERVER_URL=http://127.0.0.1:4000/mcp/invoke   # 預設為本服務提供的 /mcp/invoke
   MCP_API_KEY=optional-secret                       # (選填) 需要驗證再填
   MCP_TIMEOUT_MS=20000                              # (選填) 預設 15000
   MCP_TOOLS_FILE=./mcp-tools.json                   # 或 MCP_TOOLS_JSON 放 JSON 字串
   CODEX_MCP_ALLOW_WRITE=1                           # (選填) 允許 mcp.runCodexTask 使用寫入 sandbox/full-auto
   SHORTCUTS_BIN=shortcuts                           # (選填) 指定 macOS `shortcuts` CLI 路徑
   ```

2. **工具描述**（可參考 `mcp-tools.example.json`）：

   ```jsonc
   [
     {
       "type": "function",
       "function": {
         "name": "mcp.searchKnowledgeBase",
         "description": "向 MCP 知識庫搜尋主題並回傳摘要。",
         "parameters": {
           "type": "object",
           "properties": {
             "query": { "type": "string" },
             "lang": { "type": "string", "enum": ["zh", "en"] }
           },
           "required": ["query"]
         }
       }
     }
   ]
   ```

3. **MCP 端點協定**

   - 後端會以 `POST MCP_SERVER_URL` 送出 `{ "tool": "<name>", "args": {...} }`
   - 回傳建議格式：`{ "ok": true, "output": "模型可直接引用的文字" }`
   - 若 `ok: false` 或 HTTP 不是 2xx，錯誤會寫入 `toolEvents` 並由模型轉述給使用者
   - 若未額外部署，可以直接使用本後端提供的 `POST /mcp/invoke`（`MCP_SERVER_URL` 預設即為 `http://127.0.0.1:4000/mcp/invoke`），程式會依 `mcp-tools.json` 內建資料回覆

> Ultra 模式與一般 `/api/chat` 都會自動帶入上述工具，因此設定完成後模型即可像使用 `searchWeb` 一樣觸發 MCP，前端開發者視圖也看得到 `toolEvents`。

**內建 MCP 工具（可直接使用或依此擴充）**

| 工具名稱 | 說明 |
| --- | --- |
| `mcp.searchKnowledgeBase` | 依照關鍵字搜尋內建照護知識庫，回傳 1-3 筆摘要與建議（支援 zh/en） |
| `mcp.fetchTaskStatus` | 讀取範例照護任務狀態與時間線，方便模型回報進度 |
| `mcp.fetchSnapshotRange` | 查詢指定貓咪在一段時間內的溫濕度 / 水位摘要與警報記錄 |
| `mcp.listHydrationAnomalies` | 列出近期飲水異常事件（低水位、飲水不足） |
| `mcp.triggerCalibrationReminder` | 排程感測器校正提醒並返回 ticket 資訊 |
| `mcp.syncCareTaskToNotion` | 將 Care Command Center 任務同步到外部 Notion/Todo board，並可寄送通知 |
| `mcp.runCodexTask` | 透過本機 Codex CLI 執行 `codex exec`，完成程式碼分析或修改任務；需 `CODEX_MCP_ALLOW_WRITE=1`（或 args.allowWrite=true）才可使用 `workspace-write`/`danger-full-access` + `fullAuto` |
| `mcp.listAppleShortcuts` | 透過 macOS `shortcuts list` 列出當前可用捷徑（可選 filter） |
| `mcp.runAppleShortcut` | 執行指定捷徑，並可附加輸入字串 |
| `mcp.graph.query` / `mcp.graph.upsert` | 以 Neo4j / RedisGraph 模型查詢或寫入長期照護記憶（貓咪習慣、醫療事件、環境設定）；可用於跨對話追蹤「貓咪噴嚏後多久看獸醫」等問題 |
| `mcp.fs.list` / `mcp.fs.read` / `mcp.fs.write` | 受控白名單的檔案系統存取工具，預設只讀；設 `MCP_FS_ALLOW_WRITE=1` 後可允許 AI 在指定目錄寫入修補檔案或產生報表 |
| `mcp.analytics.summarize` / `mcp.analytics.regression` | 針對快照資料或外部 Data Science MCP 延伸服務計算統計量、線性趨勢，用來偵測水位/溫度異常 |
| `mcp.cdp.fetchProfile` / `mcp.cdp.logEvent` | 連動客戶資料平台（Segment/HubSpot/Salesforce），查詢貓咪/飼主偏好並記錄推播授權或客服事件 |
| `mcp.browser.fetchPage` / `mcp.browser.search` | 透過瀏覽器 MCP 代理存取允許的官方網站、天氣/PM2.5 頁面；可搭配 `MCP_SEARCH_API_URL` 指向 search proxy 以取得真實搜尋結果 |
| 前端 palette | 選取任一 MCP 工具後會自動要求 AI 詢問參數並執行，結果同樣會出現在聊天紀錄，無須使用者手動呼叫 API |

如需接入自訂服務，只要在 `mcp-tools.json` 加入新定義，再於 `src/mcpHandlers.ts` 實作 handler（或把 `MCP_SERVER_URL` 指向外部 bridge）即可。若想直接使用社群提供的 [mcp-server-apple-shortcuts](https://github.com/recursechat/mcp-server-apple-shortcuts)，可照官方指引 `git clone` → `npm install` → `npm run build`，再於 MCP 設定裡將 `command: "npx"`、`args: ["/path/to/mcp-server-apple-shortcuts/build/index.js"]`，即可讓其他客戶端（例如 Claude Desktop）也能呼叫相同捷徑。

### ⚡ 性能優化（2025.11）

後端現已整合 **esbuild** 作為默認構建工具：

- **構建速度提升 5850 倍**：從 234 秒降至 **0.04 秒**！
- **開發工作流程**：
  - 日常開發：直接使用 `npm run dev`（tsx watch，變更即時重載，無需手動重啟）
- 生產構建：使用 `npm run build`（esbuild 只重新編譯有變更的檔案，預設秒級完成）
  - 類型檢查：`npm run typecheck`（esbuild 不做類型檢查，需要單獨運行）

詳細說明請參考：
- **`/Users/meaqua/Desktop/EE3070/ESBUILD_GUIDE_ZH.md`** - esbuild 完整使用指南
- **`/Users/meaqua/Desktop/EE3070/PERFORMANCE_FIXES_ZH.md`** - 性能優化總結

啟動後預設監聽 `http://0.0.0.0:4000`。若要允許同網段同學連線，可將 Mac 的 IP 提供給他們，例如：`http://192.168.x.x:4000`。

## 環境變數

| 變數 | 預設 | 用途 |
| ---- | ---- | ---- |
| `PORT` | `4000` | 後端服務埠號 |
| `ALLOWED_ORIGINS` | （不限） | 允許的前端來源，逗號分隔。若留空即允許所有來源（開發模式）。若要透過手機熱點存取（例：前端 `http://172.20.10.2:5173`），請記得加入 `172.20.10.2:5173`，否則會被 CORS 擋下。|
| `JSON_BODY_LIMIT` | `80mb` | `express.json()` 的 body 容量上限，含影像 base64；檔案上傳（前端約 50MB）會轉成 base64，預設 80MB 可避免 413。|
| `HISTORY_LIMIT` | `24` | `/api/history` 回傳的最大筆數 |
| `DB_PATH` | `smart-cat-home.db` | SQLite 檔案路徑 |
| `HARDWARE_API_KEY` | （空） | 與 Arduino `credentials.h` 中的 `BACKEND_API_KEY_STR` 對應。若設定，`POST /api/snapshots` 必須帶 `Authorization: Bearer ...` |
| `CAMERA_BASE_URL` | （空） | 若要由後端代理 ESP32-S3-CAM 狀態與快照，填入相機的 Base URL（例如 `http://192.168.0.150`）；未設定時僅依事件 (`/api/camera/events`) 更新。 |
| `CAMERA_STATUS_PATH` | `/status` | 相機狀態端點的相對路徑，搭配 `CAMERA_BASE_URL` 組成完整 URL |
| `CAMERA_SNAPSHOT_PATH` | `/snapshot.jpg` | 相機快照端點的相對路徑 |
| `CAMERA_API_KEY` | （空） | 若相機呼叫後端需要驗證，填入與 `camera_credentials.h` 一致的密鑰；後端代理狀態/快照時也會附帶該 Authorization |
| `ADMIN_API_KEY` | （空） | （選填）受保護的管理端點備援憑證；若未設定則需以 `developer` 帳號登入前端後才能操作 |
| `HTTPS_CERT_PATH` | — | 若提供憑證與私鑰，可改以 HTTPS 服務；填入憑證檔路徑 |
| `HTTPS_KEY_PATH` | — | HTTPS 私鑰檔路徑 |
| `SERIAL_ENABLED` | `false` | 設為 `true` 後啟用序列埠橋接，直接讀取 Arduino JSON |
| `SERIAL_PORT` | — | 序列埠路徑（例如 `/dev/tty.usbmodem1101`），需在 `SERIAL_ENABLED=true` 時設定 |
| `SERIAL_BAUD` | `115200` | Arduino 序列鮑率 |
| `CAT_PRESENCE_WEIGHT_KG` | `1` | 依壓力感測（貓咪體重）判斷在屋內的臨界值（kg） |
| `ALERT_HISTORY_LIMIT` | `50` | 近期自動警報的保留筆數（會同步儲存在 SQLite `automation_alerts` 表中） |
| `PUSH_BATCH_SIZE` | `10` | 單批推播通知的發送數量上限（避免一次打爆推播服務） |
| `PUSH_BATCH_DELAY_MS` | `200` | 每批推播之間的延遲毫秒數 |
| `OLLAMA_BASE_URL` | — | 若使用本地 Ollama，填入例如 `http://localhost:11434` |
| `OLLAMA_MODEL` | — | Ollama 模型名稱（例如 `qwen2:7b`） |
| `OPENAI_API_KEY` | — | 若使用 OpenAI Chat Completions，填入 API Key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI 模型 ID |
| `LOCAL_LLM_MODEL_ID` | `NexaAI/Qwen3-4B-Thinking-2507-merged` | Nexa 聊天模型 ID（建議註冊本地 GGUF 時沿用這個名稱） |
| `LOCAL_LLM_SERVER_MODEL` | `NexaAI/Qwen3-4B-Thinking-2507-merged` | 若伺服器需要覆寫 `model` 參數，填入 Nexa 伺服器公布的別名 |
| `LOCAL_LLM_MAX_TOKENS` | `512` | 單次回覆的最大片段長度 |
| `LOCAL_LLM_TEMPERATURE` | `0.7` | Nexa 推論使用的溫度參數 |
| `LOCAL_LLM_TOP_P` | `0.9` | Nexa 推論使用的 Top-p |
| `LOCAL_LLM_PYTHON` | `python3` | 執行 `scripts/local_llm_infer.py` 的 Python 路徑（建議指向虛擬環境） |
| `LOCAL_LLM_SERVER_URL` | `http://127.0.0.1:18181` | Nexa OpenAI 相容伺服器的 Base URL |
| `LOCAL_LLM_SERVER_KEY` | — | 若 Nexa 伺服器啟用授權 Token，填入這裡 |
| `SMART_CAT_AI_DEBUG` | `true（NODE_ENV !== 'production' 時）` | 顯示 `[ai-debug]` 日誌，協助開發期間追蹤推論流程；設為 `false` 可靜音 |
| `SMART_CAT_DEV_FORCE_THINKING` | `false` | 若需強制本地模型輸出 `<think>` 區塊，可設為 `true`；預設關閉以避免推理片段洩漏 |
| `LOCAL_LLM_TIMEOUT_MS` | `240000` | 本地模型子程序的逾時毫秒數；設為 `0` 表示不主動終止 |
| `LOCAL_LLM_REQUEST_TIMEOUT_MS` | `45000` | 呼叫本地常駐推論服務的 HTTP 逾時毫秒數，設為 `0` 表示交由底層管理 |
| `EXTERNAL_REQUEST_TIMEOUT_MS` | `120000` | 呼叫 Ollama / OpenAI 時的逾時毫秒數；若使用大型模型（如 `qwen3:8b`）建議視硬體調高 |
| `EXTERNAL_REQUEST_RETRIES` | `1` | 外部 AI 服務失敗時的重試次數（不含首次呼叫） |
| `MCP_FS_ROOTS` | `smart-cat-backend, ..` | MCP 檔案系統工具可訪問的白名單根目錄（逗號分隔）。預設包含後端與整個專案根目錄。 |
| `MCP_FS_ALLOW_WRITE` | `0` | 設為 `1` 才允許 `mcp.fs.write` 修改檔案；預設只讀。 |
| `MCP_BROWSER_ALLOWLIST` | `https://www.cwb.gov.tw` | MCP 瀏覽器工具允許抓取的網域清單，逗號分隔，可填官方天氣站、PM2.5、獸醫院等網站。 |
| `MCP_BROWSER_TIMEOUT_MS` | `15000` | MCP 瀏覽器工具抓取單頁的逾時毫秒數。 |
| `MCP_SEARCH_API_URL` | （空） | 指向外部 search proxy（例如 `search-proxy` 或 `browser-use` MCP）。未設定時改用內建索引。 |
| `LOCAL_VISION_MODEL_ID` | `NexaAI/Qwen3-VL-4B-Instruct-GGUF` | Nexa 視覺模型 ID |
| `LOCAL_VISION_SERVER_MODEL` | — | 若 Nexa 伺服器以別名提供視覺模型，可在此覆寫 |
| `LOCAL_VISION_MAX_TOKENS` | `256` | 圖像說明的最大生成長度 |
| `LOCAL_VISION_TEMPERATURE` | `0.6` | 圖像說明生成的溫度參數 |
| `LOCAL_VISION_TOP_P` | `0.9` | 圖像說明生成的 Top-p |
| `LOCAL_VISION_TIMEOUT_MS` | `240000` | 單次圖像推論的逾時毫秒數，設為 `0` 表示不逾時 |
| `LOCAL_VISION_REQUEST_TIMEOUT_MS` | `60000` | 呼叫常駐視覺伺服器的 HTTP 逾時毫秒數 |
| `LOCAL_VISION_SERVER_URL` | — | Nexa 視覺伺服器的 Base URL（未填則沿用 `LOCAL_LLM_SERVER_URL`） |
| `LOCAL_VISION_SERVER_KEY` | — | 視覺伺服器授權 Token，預設沿用 `LOCAL_LLM_SERVER_KEY` |
| `LOCAL_VISION_MAX_IMAGE_SIDE` | `640` | 推論前若圖片的最長邊超過此值會自動等比例縮放，降低 CPU/GPU 負載 |
| `LOCAL_VISION_ALLOW_SCRIPT_FALLBACK` | `true` | 設為 `true` 時，視覺伺服器超限或連線失敗會退回單次腳本（較慢但穩定） |
| `ENABLE_TTS` | `true` | 啟用 Hugging Face 文字轉語音 API（`POST /api/ai/tts`）。若設為 `false`，前端僅使用瀏覽器備援語音 |
| `TTS_MODEL_ID` | `Xenova/xtts-v2` | 使用的 Hugging Face 模型 ID，需為 transformers.js 支援的文字轉語音模型 |
| `TTS_LANGUAGE` | `en` | 預設語音語系（`xtts-v2` 支援 `en`、`zh`、`ja`、`es`…） |
| `TTS_SPEAKER_ID` | `en_female_1` | 預設聲線，可改為 `en_male_1`、`zh_female_0` 等 ID |
| `TTS_DEFAULT_VOICE_ID` | （空） | 指定後端預設語音預設檔（例如 `soothing-mandarin`），前端未傳 `voiceId` 時會套用 |
| `TTS_ENGINE` | `xenova` | 語音引擎：`xenova` 使用本地 transformers.js；設定為 `edge` 時改用 Microsoft Edge TTS（需網路）。`xenova` 失敗時會自動退回 `edge` |
| `EDGE_TTS_VOICE` | `en-US-JennyNeural` | Edge TTS 預設聲線，可改為 `zh-TW-HsiaoYuNeural`、`en-GB-RyanNeural` 等 Microsoft Neural 聲音 |
| `EDGE_TTS_TOKEN` | — | 若不要使用預設內建 Token，可填入自行擷取的 `TrustedClientToken` 以降低 403 風險 |
| `EDGE_TTS_ENDPOINT` | `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` | Edge TTS WebSocket 端點，如官方有調整可覆寫 |
| `GOOGLE_TTS_LANGUAGE` | `en-US` | 使用 Google TTS 時的語系（例：`zh-TW`、`en-GB`），若預設檔有自訂會優先生效 |
| `TTS_MAX_CHARACTERS` | `500` | 單次語音合成允許的最大字數，避免過長內容造成逾時 |
| `RATE_LIMIT_TTS_WINDOW_MS` | `60000` | TTS API 速率限制視窗（毫秒） |
| `RATE_LIMIT_TTS_MAX` | `6` | 單個視窗內允許的 TTS 請求次數 |
| `GEMMA_API_KEY` | — | Google Generative AI API Key，供 `analyzeImage` 工具呼叫 Gemma 3 4B 視覺模型（可選） |
| `GEMMA_VISION_MODEL` | `gemma-3-4b-it` | 可覆寫的 Gemma 模型名稱 |
| `GEMMA_VISION_ENDPOINT` | `https://generativelanguage.googleapis.com/v1beta/models` | Gemma 影像 API 端點 |
| `VAPID_CONTACT` | `mailto:smart-cat-home@example.com` | 推播通知的聯絡 Email（搭配 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 使用） |
| `NATIVE_PUSH_ENABLED` | `false` | 啟用原生 App 推播（APNs／FCM）。若為 `true`，至少需設定 APNs 或 FCM 其中一組憑證。 |
| `APNS_AUTH_KEY_PATH` | — | Apple Developer 下載的 `AuthKey_XXXXXX.p8` 路徑（相對或絕對）。可改用 `APNS_AUTH_KEY_BASE64` 內嵌憑證。 |
| `APNS_AUTH_KEY_BASE64` | — | 以 base64 編碼的 `.p8` 內容，適合容器或雲端部署。 |
| `APNS_KEY_ID` | — | Apple Developer 介面上的 Key ID。 |
| `APNS_TEAM_ID` | — | Apple Developer Team ID。 |
| `APNS_BUNDLE_ID` | `com.smartcathome.app` | 要推播的 iOS App Bundle Identifier。 |
| `APNS_USE_PRODUCTION` | `false` | `true` 時改用正式 APNs 端點，發版時再切換。 |
| `FCM_SERVICE_ACCOUNT_PATH` | — | Firebase 服務帳號 JSON 路徑（供 Android / FCM 推播使用）。 |
| `FCM_SERVICE_ACCOUNT_BASE64` | — | base64 編碼的 Firebase 服務帳號 JSON，與 `*_PATH` 二擇一。 |

> 若僅使用本地 Qwen 模型處理對話，可將 `OLLAMA_MODEL` 留空，後端便會跳過 Ollama fallback（仍可透過 Ollama 呼叫 Gemma 視覺模型）。

> 📄 `.env.example` 已預先列出常用設定，複製後按需求修改即可。

### 使用 Nexa 進行本地推論

Nexa CLI 會啟動 OpenAI 相容的 REST 介面，前端與後端皆可使用現有的 `/v1/chat/completions` 流程。建議流程如下：

1. 安裝 [Nexa CLI](https://sdk.nexa.ai)（macOS 可下載 `nexa-cli_macos_arm64.pkg`，Linux/Windows 請依 README 指示）。
2. 登入並在 Nexa Portal 建立授權 Token（若要使用 Pro 模型），於終端機執行<br>`nexa config set license '<YOUR_TOKEN>'`。
3. 下載所需模型（支援 GGUF、MLX 與 .nexa）：<br>`nexa pull NexaAI/Qwen3-4B-4bit-MLX`（聊天）<br>`nexa pull NexaAI/Qwen3-VL-4B-Instruct-GGUF`（視覺）。
4. 啟動 Nexa 伺服器（預設 `http://127.0.0.1:18181`）：<br>`nexa serve --skip-migrate --skip-update`。如需額外的視覺實例，可在不同終端設定 `NEXA_HOST=127.0.0.1:18182` 後再執行一次同樣的指令。
5. 在 `.env` 中設定 `LOCAL_LLM_MODEL_ID`、`LOCAL_LLM_SERVER_MODEL`（若有別名）、`LOCAL_LLM_SERVER_URL=http://127.0.0.1:18181`。視覺模型如使用不同埠號，再補上 `LOCAL_VISION_SERVER_URL=http://127.0.0.1:18182` 與對應的 `LOCAL_VISION_MODEL_ID`。

> 如果 Nexa 伺服器啟用了授權驗證，請將 Token 放入 `LOCAL_LLM_SERVER_KEY`／`LOCAL_VISION_SERVER_KEY`，後端會自動帶上 `Authorization: Bearer ...`。

> ⚠️ **Thinking 專用模型（例如 `NexaAI/Qwen3-4B-Thinking-2507-merged`）不支援工具呼叫**。後端會自動在啟用 thinking 的層級關閉 `tools`，並保留 `<think>` 流程；若自行呼叫 Nexa API，務必只送 `system` / `user` 訊息，避免混用 Harmony 或 function-calling 模板。

### 合併 LoRA 並轉換為 GGUF

若需要使用自家的 Thinking LoRA 聊天模型，可依下列流程：

1. 安裝 `transformers`、`peft`、`torch` 後，載入 base 模型與 LoRA，使用 `PeftModel.from_pretrained(...).merge_and_unload()` 產出合併後的 safetensors。
2. 下載 `llama.cpp` 專案，執行 `convert_hf_to_gguf.py` 轉出 F16 GGUF，再用 `llama-quantize` 量化成 `q4_0`（建議結果約 2.2 GiB）。
3. 透過 Nexa 的 localfs 模式註冊本地模型（保持與官方相同的模型 ID，方便後端沿用）：  
   ```bash
   nexa pull NexaAI/Qwen3-4B-Thinking-2507-merged \
     --model-hub localfs \
     --local-path /Users/meaqua/models/Qwen3-4B-Thinking-2507-merged \
     --model-type llm
   ```
   指令執行時會顯示可用的 GGUF 清單，依提示選擇 `Qwen3-4B-Thinking-2507-merged-q4_0.gguf` 或 F16 版本即可。
4. 更新 `.env` 的 `LOCAL_LLM_MODEL_ID`／`LOCAL_LLM_SERVER_MODEL` 為 `NexaAI/Qwen3-4B-Thinking-2507-merged`，重啟 `nexa serve` 與後端即可。

> 若視覺模型請求偶爾超出 context，建議啟用 `LOCAL_VISION_ALLOW_SCRIPT_FALLBACK=true`，並保持影像提示語精簡（例如僅描述必須觀察的重點），以降低 token 消耗。

## Hugging Face 文字轉語音（TTS）

後端透過 `@xenova/transformers` 內建的 `Xenova/xtts-v2` 管線提供 `/api/ai/tts` 端點，並可切換 Google TTS 或 Edge TTS：

- **啟用方法**：`.env` 設 `ENABLE_TTS=true` 並設定 `ADMIN_API_KEY`，前端會自動帶上 `x-smartcat-admin: Bearer ...`。
- **暖機下載**：第一次呼叫會自動下載模型與 ONNX Runtime WASM，約 400 MB。下載完成後緩存在 `~/.cache/huggingface/transformers`，後續可離線運作。
- **Edge TTS 後援**：若 Hugging Face 模型下載遭拒（常見為 401 未授權）或網路阻塞，後端會自動改用 Microsoft Edge TTS；亦可設定 `TTS_ENGINE=edge` 並透過 `EDGE_TTS_VOICE` 選擇聲線。
- **Google TTS**：將 `TTS_ENGINE=google` 後可使用 Google Translate 的無授權語音服務，適合快速獲得較自然的播報；可用 `GOOGLE_TTS_LANGUAGE` 切換 `en-US`、`zh-TW` 等語系。
- **語言/聲線**：請求可附帶 `language`（如 `zh`）與 `speakerId`（如 `zh_female_0`）；若省略則使用 `.env` 預設值。Google TTS 會依語系自動選擇最接近的韻味，Edge TTS 則對應預設檔中的 `edgeVoice`。
- **輸入過濾**：為避免不自然的唸法，後端會自動移除 emoji 與 `_ - * & ^` 等符號後再送往語音服務。
- **範例呼叫**：
  ```bash
  curl -X POST http://127.0.0.1:4000/api/ai/tts \
    -H "Content-Type: application/json" \
    -H "x-smartcat-admin: Bearer ${ADMIN_API_KEY}" \
    -d '{"text":"Smart Cat Home 語音測試","language":"en"}'
  ```
  > 將 `${ADMIN_API_KEY}` 替換為 `.env` 裡設定的管理密鑰。
- **回應內容**：`{ ok: true, data: { audioBase64, format: 'audio/wav' | 'audio/mpeg', sampleRate, durationSeconds } }`
- **前端備援**：若端點回傳 503 或達到 `RATE_LIMIT_TTS_MAX`，聊天面板會提示並自動退回瀏覽器 Web Speech API 播報。

## API 摘要

| 方法 | 路徑 | 功能 |
| ---- | ---- | ---- |
| `GET /health` | 伺服器健康狀態 |
| `GET /api/settings` | 取得目前 Autoset 設定 |
| `POST /api/settings` | 更新 Autoset 設定（body 為 `SmartHomeSettings`） |
| `POST /api/snapshots` | 新感測資料；body 需含 `reading`，也可附帶 `settings` |
| `GET /api/snapshot/latest` | 取得最新快照 |
| `GET /api/history` | 最近 N 筆資料（預設 24） |
| `GET /api/audio/status` | 取得 8802B 功放狀態（需登入使用者） |
| `POST /api/audio/play` | 以指定樣式播放提示音（需 `x-smartcat-admin` 管理密鑰） |
| `POST /api/audio/stop` | 停止目前的播放（需 `x-smartcat-admin`） |
| `POST /api/audio/config` | 調整音量 / 靜音狀態或覆蓋播放樣式（需 `x-smartcat-admin`） |
| `GET /api/camera/status` | 取得 ESP32-S3-CAM 最新狀態與偵測結果（需登入使用者） |
| `POST /api/camera/refresh` | 立即輪詢相機狀態（需 `x-smartcat-admin`） |
| `GET /api/camera/snapshot` | 透過後端代理最新快照（需登入使用者） |
| `POST /api/camera/events` | 相機主動回報偵測事件（需 `Authorization: Bearer <HARDWARE_API_KEY>` 或 `CAMERA_API_KEY`） |
| `POST /api/preferences/language` | 儲存語系 `{ language: "zh" | "en" }` |
| `POST /api/push-subscriptions` | 登錄 Web Push 訂閱 |
| `POST /api/equipment/test` | 依最新快照推估 Arduino 是否在線（5 分鐘內即視為成功） |
| `POST /api/chat/suggestions` | 使用最新感測資料與歷史趨勢產生 AI 建議（會優先呼叫 Ollama → OpenAI，若未設定則回傳規則式建議） |
| `GET /api/calibration` | 取得目前的感測器校正參數 |
| `POST /api/calibration` | 更新感測器校正參數（空白或省略的欄位視為沿用先前設定） |
| `GET /api/alerts/recent` | 取得自動健康檢查產生的最新提醒 |
| `GET/POST/PATCH/DELETE /api/alert-rules` | 管理自訂警報規則（臨界值、嚴重度與啟用狀態） |
| `GET /api/memories/keywords` | 取得 AI 記憶熱門關鍵字（提供關鍵字雲資料） |
| `GET/POST/DELETE /api/chat/favorites` | 新增、列出或刪除聊天收藏訊息 |
| `GET /api/diagnostics/report` | 下載最新診斷報告（純文字，包含快照、警報、收藏與修復紀錄） |

> 備註：`POST /api/settings` 與 `POST /api/calibration` 成功套用後會自動新增 type=`setting` 的記憶，`source` 分別標記為 `api:updateSettings`、`api:updateCalibration`，方便 AI 回顧最近的設定或校正調整。

## 測試

- **AI 煙霧測試**：啟動後端後執行
  ```bash
  npm run chat:smoke
  ```
  此指令會自動設定 `SMART_CAT_BACKEND_URL=https://localhost:4000` 與 `NODE_TLS_REJECT_UNAUTHORIZED=0`，確保在自簽 HTTPS 環境下也能測試 `/api/chat/suggestions`。若後端改用其他主機或埠號，可先覆寫 `SMART_CAT_BACKEND_URL` 再執行。

回傳格式皆為 `{ ok: boolean, data?: any, message?: string }`，已與前端 `backendClient.ts` 封裝一致。

## 資料表速查

- `snapshots`：儲存每筆感測快照，`/api/history` 與 `/api/snapshot/latest` 會讀取此表。
- `settings`、`preferences`、`calibration`：分別保存 Autoset、語系偏好與感測器校正值。
- `automation_alerts`：自動健康提醒（含自訂規則觸發的訊息）。
- `alert_rules`：使用者自訂警報規則（比較條件、門檻、嚴重度、啟用狀態）。
- `chat_favorites`：聊天收藏（星號訊息、role、內容與自訂 metadata）。
- `notification_fixes`：通知排錯流程記錄的修復嘗試（成功/失敗與訊息）。
- `memories`：AI 記憶（`note`/`conversation`/`setting`），預設僅保留最新 400 筆；後端在設定、校正更新時會自動寫入差異摘要。

## 與前端整合

1. 在 `smart-cat-home/.env.local` 設定：
   ```bash
   VITE_API_BASE_URL=https://localhost:4000
   VITE_ENABLE_MOCKS=false
   ```
   若瀏覽器尚未信任自簽憑證，請先在 `https://localhost:4000` 點選「進階」→「繼續前往」。
2. 重新啟動前端開發伺服器 `npm run dev -- --host --port 5173`，並以 `https://localhost:5173` 造訪儀表板。
3. 若 Arduino 端要送資料，可用 HTTP POST：
   ```http
   POST http://localhost:4000/api/snapshots
   Content-Type: application/json
   Authorization: Bearer YOUR_HARDWARE_API_KEY  # 若 .env 設定了 HARDWARE_API_KEY，務必加入此行

   {
     "reading": {
       "temperatureC": 25.3,
       "humidityPercent": 48,
       "waterIntakeMl": 190,
       "airQualityIndex": 30,
       "catWeightKg": 4.05,
       "lastFeedingMinutesAgo": 120,
       "timestamp": "2024-03-20T12:00:00.000Z",
       "waterLevelPercent": 72.5,
       "ambientLightPercent": 38,
       "catPresent": true
     }
   }
   ```
   伺服器會自動更新 SQLite 中的最新快照並回傳給前端。也可以用指令快速模擬：
   ```bash
   npm run seed:snapshot
   ```
   可透過環境變數調整數值，例如 `TEMP=27 HUMIDITY=40 npm run seed:snapshot`。

### 使用序列埠自動上傳

1. 以 `ls /dev/tty.*` 找出 Arduino 連接的埠名（例如 `/dev/tty.usbmodem1101`）。
2. 在終端機設定環境變數或建立 `.env` 後執行：
   ```bash
   SERIAL_ENABLED=true SERIAL_PORT=/dev/tty.usbmodem1101 SERIAL_BAUD=115200 npm run dev
   ```
3. Arduino 韌體每次 `Serial.println(JSON);`（以換行結尾）即可由後端自動解析並寫入歷史記錄。
   - 若額外提供 `waterLevelPercent`（0–100）、`ambientLightPercent`（0–100）與 `catPresent`（布林值，可省略），後端會將其轉換為喝水量、亮度卡片與貓咪是否在屋內的資訊；`catPresent` 缺省時則以 `CAT_PRESENCE_WEIGHT_KG` 判斷。
4. 後端在設定或校正更新時會自動傳送 JSON 指令，例如：
   ```json
   {"type":"updateSettings","payload":{...},"timestamp":"2025-01-01T00:00:00.000Z"}
   {"type":"updateCalibration","payload":{...},"timestamp":"2025-01-01T00:00:05.000Z"}
   ```
   韌體需監聽每一行 JSON，依 `type` 套用 Autoset 目標或更新感測器校正；若硬體暫時離線，重新連線後後端會再次推送最新狀態。
5. 「感測器校正」面板讀取的數值可透過 `/api/calibration` 取得/更新，便於韌體或 AI 以相同參數計算實際亮度、水位與體重。
6. 若已設定 VAPID 金鑰與 `VAPID_CONTACT`，自動健康檢查（低水位、亮度過高、貓咪離開等）會透過 `/api/alerts/recent` 與推播同步送出提醒。
7. 參考 `arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino`（預設 115200 bps），整合 HC-SR04、DHT11、LDR、FSR，輸出格式為：
   ```json
   {"reading":{
     "temperatureC":24.8,
     "humidityPercent":52,
     "waterLevelPercent":68,
     "ambientLightPercent":35,
     "catWeightKg":3.9,
     "catPresent":true,
     "waterIntakeMl":120,
     "lastFeedingMinutesAgo":95,
     "airQualityIndex":30,
     "raw":{"ldrAdc":410,"fsrAdc":612,"distanceCm":8.4}
  }}
  ```
  韌體會解析後端的 `updateSettings`/`updateCalibration` 指令，並以 `z`（歸零）、`c`（2 公斤校正）、`f`（重置餵食計時）快捷鍵輔助調校。
  若偵測到 ST021（SHT21 相容）會覆寫 DHT11 未能量測到的溫濕度，但未安裝時 DHT11 即可提供資料，方便快速上線。

### Web Push 啟用與測試

1. 產生 VAPID 金鑰：`npx web-push generate-vapid-keys`，將公私鑰分別填入後端 `.env`（`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`）與前端 `.env.local`（`VITE_VAPID_PUBLIC_KEY`）。
2. `.env.local` 的 `VITE_API_BASE_URL` 要設定為行動裝置可連的 IP，例如 `http://192.168.0.198:4000`，並更新 `VITE_API_BASE_URL_MAP` 讓 `localhost`、`127.0.0.1` 也映射到同一 IP。後端 `.env` 則需把 `capacitor://localhost` 與 `http://<LAN-IP>:5173` 加入 `ALLOWED_ORIGINS`。
3. 若要給 Capacitor App 使用，請以 `SMART_CAT_BASE=./ npm run build && npx cap sync ios/android` 產生相對路徑資產；iOS 若暫時走 HTTP，記得在 `Info.plist` 啟用 `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking`。
4. 重新安裝 App，進入設定頁點「啟用背景通知」，系統會註冊 Service Worker 並透過 `/api/push-subscriptions` 儲存 subscription。之後呼叫 `POST /api/alerts/test` 或 `npm run seed:snapshot` 即可驗證通知是否送達。

### 原生 App 推播（APNs / FCM）

1. **後端設定**：將 `NATIVE_PUSH_ENABLED=true`，並依平台填入 APNs (`APNS_AUTH_KEY_PATH`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`) 或 Firebase (`FCM_SERVICE_ACCOUNT_PATH` 或 `FCM_SERVICE_ACCOUNT_BASE64`) 憑證。重新啟動後端後，`native_push_devices` 會開始儲存原生裝置。 
2. **前端（Capacitor）**：安裝 `@capacitor/push-notifications` 後執行 `npx cap sync ios android`。Xcode 需啟用 Push Notifications + Remote notifications Background Mode；Android 則需放入 `google-services.json` 並依 Firebase 指南啟用 FCM。 
3. **iOS 注意事項**：在 Apple Developer Console 建立 Push Auth Key（.p8），將 Key ID / Team ID / Bundle ID 填入 `.env`。若要走 FCM，記得在 Firebase Console 綁定相同 Bundle 並上傳 APNs Key，並將 `GoogleService-Info.plist` 放進 `ios/App/App/`。 
4. **Android 注意事項**：使用 Firebase Cloud Messaging，下載服務帳號 JSON（供後端發送）與 `google-services.json`（供 App 端註冊 token）。`transport` 會自動設定為 FCM。 
5. **測試**：在 App 設定頁點「啟用背景通知」即可觸發 `PushNotifications.register()`，後端會把 token 寫入資料庫。隨後呼叫 `POST /api/alerts/test` 或等待自動警示，就能同時推播到 Web（VAPID）與 iOS/Android。 

### SQLite 資料位置

- 預設資料庫檔在後端根目錄 `smart-cat-home.db`。可透過 `DB_PATH=/path/to/db.sqlite` 變更。
- 表格包含 `snapshots`、`settings`、`preferences`、`push_subscriptions`、`calibration` 與 `automation_alerts`。警報會同步寫入 `automation_alerts`，確保重啟不會遺失近期紀錄。

### AI 建議與自動化能力

- 設定 `OLLAMA_BASE_URL` 與 `OLLAMA_MODEL` 後，後端會把整理好的感測摘要與歷史資料送給 Ollama 模型；若未設定則改走 OpenAI（需要 `OPENAI_API_KEY`），兩者都缺時會使用規則式建議。
- **環境狀態分析**：AI 會彙整溫、濕、光、飲水、體重與餵食間隔，並顯示緊急情境的建議。
- **自動化工具**
  - `updateSettings`：調整 Autoset 目標、餵食排程或清淨機強度；後端會套用安全範圍（例如 16–36°C）。
  - `updateCalibration`：更新感測器校正數值（FSR、光敏、超音波等）。
  - `analyzeImage`：呼叫本地或遠端 Qwen3-VL/Gemma 模型解析照片，再把摘要或安全提醒提供給聊天模型。
  - `saveMemory`：依使用者「請記住 / make a note」等指示儲存備忘。後端僅接受長度 ≥ 3 的文字內容，預設寫入 type=`note`，並在回應中附上新記憶的 ID 與摘要，方便前端顯示「記憶庫更新」。
  - `searchWeb`：透過本地安全搜尋代理（`scripts/safe_search_proxy.js`）取得經審核的網頁摘要。工具會限制查詢字數、最多回傳 5 筆結果，並提醒模型再次核對重點，避免引用不可信內容。
  - 模型需以 JSON 回傳指令（例如 `{"tool":"updateSettings","args":{"targetTemperatureC":25}}`），後端執行後再把結果回傳給模型，模型接著向使用者回報。
- **安全與可觀察性**：每次工具呼叫都會檢查輸入範圍，並在回應中提供 `args` 與 `durationMs` 供前端顯示執行紀錄。

> ✅ 聊天主流程仍由 Qwen3-4B（LoRA）生成最終回答；若使用者上傳圖片，後端會先透過 Qwen3-VL LoRA 取得影像摘要，然後把結果嵌入聊天上下文，再由 4B 模型回覆使用者，達到「圖文拆分、文字合併」的互動體驗。

### 安全搜尋代理（Optional）

若希望 AI 能即時查詢網路資料，可啟動 repo 內的 `scripts/safe_search_proxy.js` 作為白名單代理，並設定以下環境變數：

| 變數 | 範例 | 說明 |
|------|------|------|
| `SMARTCAT_SEARCH_UPSTREAM` | `https://api.thirdparty.com/search` | 外部搜尋 API 端點（需支援 `GET` 並回傳 JSON） |
| `SMARTCAT_SEARCH_API_KEY` | `sk-xxxx` | 上游服務金鑰（如不需金鑰可留空） |
| `SMARTCAT_SEARCH_HOST` | `127.0.0.1` | 代理監聽位址 |
| `SMARTCAT_SEARCH_PORT` | `5858` | 代理監聽埠號 |

啟動範例：

```bash
SMARTCAT_SEARCH_UPSTREAM="https://api.example.com/search" \
SMARTCAT_SEARCH_API_KEY="your-upstream-key" \
node scripts/safe_search_proxy.js
```

啟動後，於後端 `.env` 設定：

```env
SMARTCAT_SEARCH_PROXY_URL=http://127.0.0.1:5858/search
SMARTCAT_SEARCH_TIMEOUT_MS=8000
```

模型呼叫 `searchWeb` 時即會打到安全代理，代理會限制查詢字串長度、強制最多 5 筆結果並清除未允許的參數，降低 prompt injection 或敏感資訊洩露的風險。最終聊天回覆仍需要模型再次交叉檢查內容並清楚標示來源。
