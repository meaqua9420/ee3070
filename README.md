# Smart Cat Home Dashboard

Smart Cat Home 是針對智慧貓屋打造的 React + TypeScript 應用，支援 Arduino/ESP8266 感測資料、Autoset 控制、AI 健康建議、AI 對話建議，以及設備連線檢測與推播通知。

## ✨ 最新更新 (2025-11)

### ⚡ 性能優化 - HMR 熱模塊替換已啟用

- **HMR（Hot Module Replacement）已啟用**：修改代碼後**立即生效**，無需刷新頁面！
- **開發體驗提升 10 倍**：之前每次修改都需要整頁刷新，現在只需幾毫秒即可看到更新
- **保持應用狀態**：修改 CSS、組件時，表單輸入、對話記錄等狀態都會保留
- **Vite 最佳實踐**：現在完全發揮 Vite 的性能優勢

### ⚡ 建置效率升級
- 改用 `@vitejs/plugin-react-swc`，以 SWC 替換 Babel，前端 `npm run build` 時間可下降 20-40%
- 維持原有 Vite 設定、PWA 與 HMR 行為，無須額外調整專案流程

詳細說明請參考：
- **`/Users/meaqua/Desktop/EE3070/PERFORMANCE_FIXES_ZH.md`** - 性能優化總結

### 🚀 性能優化 (2025-10)
- **修復 FPS 測量導致的卡頓問題**：PerformancePanel 從 60 FPS 更新降至每 500ms 更新一次，減少 30 倍的不必要 re-renders
- **React.memo 優化**：為 TrendCharts、DataCard、AiChatPanel 等高頻組件添加 memo，防止無謂的重新渲染
- **移除不必要的 requestAnimationFrame**：優化聊天面板滾動行為
- **Sticky 表頭優化**：為歷史資料表格的 sticky header 添加 `will-change` 提示，改善滾動性能

### 🎨 使用者體驗改進
- **依時段切換色彩主題**：新增「自動」主題，會依本機時間在午後、薄暮與夜間之間切換整體配色，手機與桌面版都能自動享有適合當前光線的介面。
- **Skeleton Loader**：資料載入時顯示優雅的骨架屏動畫，支援 card、chart、text、circle 四種變體
- **Toast 通知系統**：取代舊的通知方式，提供 success、error、warning、info 四種類型的自動消失通知
- **確認對話框**：為危險操作（刪除、清除資料等）添加確認對話框，防止誤操作
- **完整的 CSS 動畫**：所有新組件都使用 GPU 加速的 transform 和 opacity 動畫

### 📱 Logo 和 PWA 改進
- **Logo 修復**：瀏覽器 favicon 從 Vite logo 改為專案的 purrfect-icon
- **手機顯示優化**：PWA manifest 的 `short_name` 從 "Smart Cat Home"（被截斷成 "S"）改為 "智慧貓宅"，在手機首頁完整顯示
- **多尺寸支援**：提供 192x192 和 512x512 兩種尺寸的 icon，支援各種設備

### 📚 新增文檔
- **UX_IMPROVEMENTS.md**：完整的使用者體驗改進組件使用說明和整合指南
- **性能優化文檔**：詳細的性能問題分析和解決方案

## 功能重點
- 📊 **即時儀表板**：展示溫度、濕度、亮度、水位推算的飲水量、體重（含貓咪是否在屋內）、空氣品質、餵食間隔等數據，並保留 24 小時歷史趨勢。
- 🧾 **資料檢視**：提供最近感測資料的表格檢視與 CSV 匯出，方便進一步分析。
- 🤖 **AI 健康顧問**：根據感測指標回傳本地規則或 fine-tune 模型建議，支援中英文切換。
- 💬 **AI 對話**：透過後端 LLM 或 Ollama 與 AI 顧問聊天，必要時可讓 AI 直接調整 Autoset 設定與校正資料。
- 🔊 **AI 語音播報**：聊天面板新增播放/停止按鈕，優先使用後端 Hugging Face 語音模型（xtts-v2），若端點不可用則自動退回瀏覽器 Web Speech API。
- 🔧 **Autoset 控制**：調整環境目標值、餵食排程與自動模式，更新後可同步給後端與硬體裝置；「套用智慧預設」會先顯示 AI 推薦值與理由的說明視窗。
- 📡 **Wi-Fi 命令佇列**：AI 或管理者透過 `/api/hardware/commands` 下達遠端設定 / 校正指令，Arduino 會輪詢並回傳結果，無需接上 USB 序列線。
- ⚙️ **自訂警報規則**：自訂感測門檻與嚴重度，異常時觸發儀表板提示與推播通知。
- 🌐 **多語系介面**：提供中文/英文介面，支援使用者記錄語言偏好與推播語系。
- 🔉 **遠端呼喚控制**：新增「音訊功放」卡片，可透過 8802B 功放播放呼喚 / 安撫 / 警示旋律、調整音量與靜音狀態。
- 📷 **ESP32-S3-CAM 監控**：儀表板顯示相機連線狀態、偵測信心值與即時快照，一鍵觸發重整或更新快照。
- 📡 **設備檢測**：一次測試 Wi-Fi 路由器、Arduino 主板、感測器、顯示器、RFID 系統等設備連線狀態。
- 🔔 **推播通知**：整合 Service Worker + VAPID，當感測數值異常時自動推送警示。
- 🛠️ **感測器校正**：在儀表板輸入 FSR、超音波、LDR 校正值，供韌體與 AI 價值參考。
- 🚨 **自動提醒**：後端定期檢查水位、亮度、貓咪進出狀態，顯示於儀表板並支援推播通知。
- 🎯 **今日概況 Hero 卡**：首頁上方的 Hero Summary 卡片聚合感測摘要、飲水、警報與 AI 狀態，並提供快速導覽錨點。
- 🌡️ **進度條儀表**：溫度、濕度、亮度卡片新增目標對照進度條與即時趨勢，一眼看出偏差幅度。
- ✨ **AI 摘要卡**：首頁新增 AI Summary 卡片與脈衝式即時連線指示燈，快速統整環境建議與串流狀態。
- 📈 **AI 推論狀態**：`AI 推論狀態` 卡片會記錄最近 10 次聊天延遲，顏色標示本機/備援來源，方便檢查模型穩定度。
- 🔍 **聊天搜尋**：對話面板內建關鍵字搜尋與訊息收藏，快速找回 AI 提供的重點。
- 📒 **AI 記憶庫**：可管理備註、對話摘要與偏好設定，模型回覆時會優先參考相關記憶，並提供「AI 行為摘要」快速瀏覽最近由工具或自動化寫入的重點；使用者若明示「請記住」之類指令，AI 也會透過 `saveMemory` 工具自行寫入備忘。
- 🧠 **記憶模板**：記憶庫提供常用例行與關鍵字模板，一鍵填入並於本機 LLM 模式下注入聊天上下文。
- ⭐ **聊天收藏**：將重要回覆加到「已收藏訊息」，方便重溫或複製行動項目。
- ☁️ **記憶關鍵字雲**：自動分析記憶內容，顯示熱門關鍵字供 AI 與使用者參考。
- 🛟 **推播排錯導覽**：一鍵檢查通知權限、Service Worker、VAPID 與後端狀態，快速排除通知問題。
- 📊 **效能儀表**：內建前端 FPS 與記憶體使用監控，協助追蹤瀏覽器效能瓶頸。
- 📝 **診斷報告下載**：Troubleshooter 可匯出完整診斷報告（健康狀態、警報、收藏與熱門記憶），利於客服及除錯。
- 🎨 **主題切換**：設定彈窗提供「自動（午後／薄暮／夜間）」、「午後暖陽」、「薄暮霞光」、「星夜靜藍」等主題，並針對不同配色自動套用對比優化。
- ⚡ **即時串流**：設定 `VITE_REALTIME_WS_URL` 後可透過 WebSocket 接收最新快照，儀表板會顯示連線狀態並同步歷史資料。
- 🛡️ **讀值驗證**：溫濕度、亮度、飲水量、空氣品質等讀值若超出安全範圍會自動校正並顯示警示，同時播放提示音提醒使用者。
- 🧭 **進階控制面板**：新增「進階控制」切換，將感測器校正、自訂警報與效能面板集中於收合區塊以維持主流程簡潔。
- 📂 **可收合的 AI 模組**：AI 顧問、記憶庫與關鍵字雲支援收合，縮減畫面佔用並保留關鍵操作。
- 📈 **趨勢重點摘要**：24 小時趨勢新增溫度與飲水小卡，顯示最新值、範圍與相較上一筆的變化幅度，並加入「今日 vs 昨日平均」摘要。

> 2025-10 更新：為降低手機端閃爍與掉幀，聊天卡片、快速指令與 Realtime 指示燈已改用靜態樣式；如需新增動畫，請避免 `infinite` 循環。

### AI 語音播報

- 聊天面板右上角提供「文字 / 語音」模式切換；切換為語音模式後，每則助理回覆都會自動播放語音（仍保留文字方便檢視），並依當前介面語言自動選擇中文或英文聲線。
- 按下聊天訊息的「播放語音」按鈕時，前端會呼叫後端 `POST /api/ai/tts` 取得 base64 WAV，並自動播放（需要後端 `.env` 啟用 `ENABLE_TTS=true` 並設定 `ADMIN_API_KEY`）。
- 若後端回傳 503 或達到 `RATE_LIMIT_TTS_MAX`，按鈕會顯示提示並改用瀏覽器 Web Speech API 播報，確保使用者仍能聽到建議。
- 進度文字「生成語音中…」表示後端正從 Hugging Face 模型合成語音；播放後再次點擊即可停止。
- 介面語言為中文時會自動對後端傳送 `language="zh"`；如需中文聲線，建議在後端 `.env` 將 `TTS_SPEAKER_ID` 改為 `zh_female_0`。

### 音訊功放與相機面板

- 音訊卡片會呼叫 `GET /api/audio/status` 取得 8802B 功放的最新狀態（音量、曲目、播放中與否）。操作按鈕則透過 `POST /api/audio/*` 端點傳送，需先以「Developer」帳號登入前端，後端會自動驗證並允許指令，無需額外的管理密鑰。
- 內建旋律包含呼喚、晨喚、喝水、喵喵呼喚、安撫、警示；AI 或使用者皆可即時切換，用於叫醒、提醒吃飯/喝水或吸引靠近鏡頭。
- 相機卡片顯示後端整合的 ESP32-S3-CAM 偵測資料，並提供「更新狀態」與「更新快照」按鈕。若要在前端看到即時影像，請於後端 `.env` 設定 `CAMERA_BASE_URL`、`CAMERA_STATUS_PATH`、`CAMERA_SNAPSHOT_PATH`，相機端則需上傳 `arduino/esp32_s3_cam` 下的草稿並設定相同密鑰。
- 若尚未配置相機或功放，面板會顯示「尚未可用」提示，待下一次快照或事件抵達後自動更新。

## 開發環境
```bash
npm install
npm run dev -- --host --port 5173
# 若只是本機測試、不需要 HTTPS，可使用極速模式：
# npm run dev:fast
```

> 若專案資料夾內存在 `localhost+2.pem`／`localhost+2-key.pem`，Vite 會使用這對自簽憑證啟動 HTTPS。首次以 Chrome 開啟時，需要在瀏覽器選擇「進階」→「繼續前往」以信任本機憑證。**PWA 與推播的 Service Worker 僅在 HTTPS（或 `http://localhost`）下運作**；若要暫時改走 HTTP，可將這兩個檔案改名為 `.disabled` 後重新啟動 dev server，日後再改回原檔名即可恢復 HTTPS。

建議在 `smart-cat-home/.env.local` 設定下列變數：
```
VITE_API_BASE_URL=https://localhost:4000
VITE_API_BASE_URL_MAP=localhost=https://localhost:4000,127.0.0.1=https://localhost:4000,172.20.10.2=http://172.20.10.2:4000
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
# 開發者身份登入後即可執行硬體/設定操作，故不再需要前端 ADMIN key
VITE_BACKEND_HEALTH_POLL_MS=60000
# 本機 demo 或教學可啟用模擬資料；若要使用真實感測資料請移除或設為 false
VITE_ENABLE_MOCKS=true
# 若使用本機 Ollama 作為 AI 顧問，可改用以下設定
VITE_OLLAMA_BASE_URL=https://your-ollama-host:11434
VITE_OLLAMA_MODEL=llama3
# 若後端提供 WebSocket 快照，可啟用即時串流
VITE_REALTIME_WS_URL=wss://localhost:4000/ws
```
可直接複製 `.env.local.example` 後按需要修改。

> 若希望後端健康狀態顯示更快刷新，可把 `VITE_BACKEND_HEALTH_POLL_MS` 改成 `10000`，即每 10 秒重新檢查一次連線狀態。

> 想在家中與辦公室間切換時，可在 `VITE_API_BASE_URL_MAP` 內加入多組 `前端主機名=後端 URL`，例如：  
> `VITE_API_BASE_URL_MAP=localhost=https://localhost:4000,192.168.1.10=http://192.168.1.10:4000,172.28.152.184=http://172.28.152.184:4000,172.20.10.2=http://172.20.10.2:4000`（手機熱點）。  
> 前端會依目前瀏覽器位址的 `hostname` 自動套用對應的後端位址，若找不到就落回 `VITE_API_BASE_URL`。當新增熱點或區網主機時，別忘了在後端 `.env` 的 `ALLOWED_ORIGINS` 新增同樣的 `hostname:5173`，否則 CORS 會拒絕請求。硬體與設定相關 API 目前僅接受已登入且具 `developer` 權限的使用者，請直接使用登入系統取得權杖，無需在前端儲存管理密鑰。

> 💡 **使用 Nexa 仍需要後端 Base URL**  
> 前端的聊天介面必須透過 Smart Cat Backend 轉發請求；即使本機已啟動 Nexa 伺服器，也要在 `.env.local` 設定 `VITE_API_BASE_URL=http://<你的後端主機>:4000`（或在 `VITE_API_BASE_URL_MAP` 配對對應 hostname），並確保後端 `.env` 的 `LOCAL_LLM_SERVER_URL` 指向 Nexa（預設 `http://127.0.0.1:18181`）。若兩者都未設定，就會看到「尚未連線 AI」的提示。

### 本機後端快速啟動

在同層的 `smart-cat-backend/` 可取得對應的 Node/Express API：

```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
cp .env.example .env   # 首次使用可複製範例
npm install
npm run dev            # 或 npm run build && npm start

# 尚未接硬體時，可用指令送一筆測試資料
npm run seed:snapshot
```

欲讓後端自動讀取 Arduino 序列資料，請在 `.env` 設定：
```
SERIAL_ENABLED=true
SERIAL_PORT=/dev/tty.usbmodemXXXX   # 依實際埠名調整
SERIAL_BAUD=115200                    # 與韌體一致
HARDWARE_API_KEY=your-secret-api-key
```
若要以 HTTPS 服務，並與前端同一張自簽憑證協作，可額外設定：
```
HTTPS_CERT_PATH=../smart-cat-home/localhost+2.pem
HTTPS_KEY_PATH=../smart-cat-home/localhost+2-key.pem
```
重載 `.env` 後再啟動 `npm run dev`，即可在 `https://localhost:4000` 上提供 API。
務必將此密鑰與 `arduino/smart_cat_serial_bridge/credentials.h` 的 `BACKEND_API_KEY_STR` 保持一致，以便後端驗證 `POST /api/snapshots`。

### PWA / Service Worker（選用）

- 為避免在本機開發時被舊版 Service Worker 卡住，`npm run build` 預設**不會**再注入 PWA，僅當設定 `VITE_ENABLE_PWA=1` 時才會啟用。
- 需要 PWA 時請執行：`VITE_ENABLE_PWA=1 npm run build` 或在 CI/CD 設定該環境變數。
- 若使用不同主機名稱（例如 `https://172.x.x.x`）訪問 preview/production，瀏覽器可能還留著舊版 SW，請先打開 `/sw-reset.html`（例如 `https://172.24.87.11:4173/sw-reset.html`）自動清理，完成後再回到主儀表板。
- 若曾經開啟過舊版 PWA，可在瀏覽器的 Application / Service Workers 面板點擊 **Unregister**，或在 Console 執行：

  ```js
  (async () => {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister()
    for (const key of await caches.keys()) await caches.delete(key)
    console.log('Service workers & caches cleared. Please hard-refresh (⌘+Shift+R).')
  })()
  ```

  然後使用 `⌘ + Shift + R` 強制重新整理，即可載入最新版前端程式。

## 本地 AI 模型（LoRA + Hugging Face）

1. **建立/啟動虛擬環境**（僅需一次）：
   ```bash
   cd /Users/meaqua/Desktop/EE3070/smart-cat-home
   source .venv-qwen3/bin/activate
   ```
2. **LoRA 訓練**（位於 `fine-tune-qwen3/`）：
   ```bash
   PYTORCH_ENABLE_MPS_FALLBACK=1 accelerate launch fine-tune-qwen3/run_qlora.py \
     --base_model /Users/meaqua/models/Qwen3-4B-Thinking-2507 \
     --dataset_path fine-tune-qwen3/cat_care_dataset.jsonl \
     --eval_dataset_path fine-tune-qwen3/cat_care_eval.jsonl \
     --output_dir outputs/qwen3-thinking \
     --batch_size 2 --micro_batch_size 1 --epochs 10 \
     --gradient_checkpointing --max_grad_norm 1.0 \
     --eval_strategy epoch --save_strategy epoch --save_total_limit 3 \
     --report_to tensorboard
   ```
   更多細節見 `fine-tune-qwen3/README.md`（資料檢查、指令意義等）。
3. **合併 LoRA → 完整模型（選用）**：如需匯出獨立模型，可臨時合併，完成後請壓縮或移除，避免長期佔用 7GB 以上空間。
   ```python
   python - <<'PY'
   from peft import PeftModel
   from transformers import AutoModelForCausalLM, AutoTokenizer
   base = '/Users/meaqua/models/Qwen3-4B-Thinking-2507'
   adapter = 'outputs/qwen3-thinking/lora-YYYYMMDD-HHMMSS'
   save = 'outputs/qwen3-thinking/full-merged'
   tok = AutoTokenizer.from_pretrained(base)
   model = AutoModelForCausalLM.from_pretrained(base, torch_dtype='auto')
   merged = PeftModel.from_pretrained(model, adapter).merge_and_unload()
   merged.save_pretrained(save, safe_serialization=True)
   tok.save_pretrained(save)
   PY
   ```
   > 💡 建議將 `outputs/qwen3-thinking/full-merged` 這類合併結果搬到 `~/models/...` 再指向新位置，可避免專案資料夾長期保留 10GB 以上檔案。

4. **讓後端讀取本地模型**：在 `smart-cat-backend/.env` 設定（建議將大型基礎模型放在 `~/models` 等共用資料夾，避免佔用專案空間）
   ```
   LOCAL_LLM_MODEL_PATH=/Users/meaqua/models/Qwen3-4B-Thinking-2507
   LOCAL_LLM_ADAPTER_PATH=/Users/meaqua/Desktop/EE3070/smart-cat-home/outputs/qwen3-thinking/lora-YYYYMMDD-HHMMSS
   LOCAL_LLM_MAX_TOKENS=160
   LOCAL_LLM_PYTHON=/Users/meaqua/Desktop/EE3070/smart-cat-home/.venv-qwen3/bin/python
   ```
   若效能不足，可改放入較小的模型（例如 Qwen2.5-1.8B 量化版），只要在啟動前把 `LOCAL_LLM_MODEL_PATH` 指向新目錄（或在 shell 以 `export LOCAL_LLM_MODEL_PATH=...` 覆寫），並視需要調整 `LOCAL_LLM_ADAPTER_PATH`。後端會依序嘗試：本地 Hugging Face（基礎 + LoRA）→ Ollama → OpenAI。
5. **Prompt 行為**：後端會根據提問內容動態決定是否帶入感測摘要。純行為/適應問題會直接給照護建議；當提到溫度、濕度、水位等關鍵詞時，仍會附上感測摘要與條列建議。
6. **可選 FastAPI 服務**：如果不希望每次呼叫都重新載入模型，可啟動 `scripts/local_llm_server.py --model /path/to/base --adapter /path/to/lora`（先 `pip install fastapi uvicorn`），並在 `.env` 設定 `LOCAL_LLM_SERVER_URL=http://localhost:7070`。後端會優先呼叫此服務，失敗時再回落到腳本／其他模型。
7. **影像常駐服務（可選）**：`analyzeImage` 工具會呼叫 Qwen3-VL / Gemma 模型解析照片；若要縮短延遲，可啟動 `scripts/local_vision_server.py --model /path/to/qwen3-vl --adapter /path/to/lora --host 127.0.0.1 --port 7080`（macOS 預設使用 MPS，若需 CPU 可設 `LOCAL_VISION_DISABLE_MPS=1`），並在 `.env` 設定 `LOCAL_VISION_SERVER_URL=http://127.0.0.1:7080` 與對應金鑰。

### AI 記憶庫（Memory Vault）

- 後端新增 `memories` 資料表與 `/api/memories` (GET/POST/PATCH/DELETE) API，資料持久化於 SQLite。實作位於 `smart-cat-backend/src/db.ts`、`src/index.ts`。
- 記憶類型 `type` 目前支援 `note`（備註）、`conversation`（對話摘要）、`setting`（偏好設定）。新增新類型時，務必同步更新前後端型別與 UI。
- `generateChatContent` 會呼叫 `loadRelevantMemories()` 從記憶庫挑選最多五筆相關記憶，以系統提示方式提供模型參考。
- 前端的 `MemoryPanel` 與聊天面板可建立／編輯／刪除記憶；聊天訊息支援「存為記憶」，方便將重要回覆轉成長期知識。
- `MemoryPanel` 提供 `MEMORY_TEMPLATES` 範本按鈕（例行流程、補水提醒、關鍵字組合），可一鍵填入標準化敘述與常用標籤。
- 當僅使用 Ollama/本機模型時，`useAiChat` 會自動把最新記憶摘要與熱門關鍵字注入系統提示，確保對話仍具長期上下文。

### 推播排錯導覽

- 設定彈出視窗提供「推播排錯」按鈕，會檢查通知權限、Service Worker 狀態、VAPID/訂閱以及後端健康。
- 若有問題會給出對應建議並可重新檢查，也提供連結至通知排錯指南。
- 相關程式碼：`src/components/NotificationTroubleshooter.tsx`、`src/utils/pushNotifications.ts`、`src/App.tsx`。

### AI 狀態卡、摘要與效能監控

- `/health` API 現包含最近一次推論延遲與最新工具事件；`AiStatusCard`、`AiHighlightsCard` 會顯示這些資訊，並允許使用者釘選重要事件或查看詳情。
- `AiSummaryCard` 會依最新快照、AI 洞察與歷史趨勢生成「今日摘要」，搭配多語系 bullet 與狀態徽章快速判斷優先事項。
- `StatusOverview` 的 Realtime 膠囊加入 `realtime-indicator` 脈衝燈，區分串流連線／輪詢／錯誤狀態。
- `PerformancePanel` 會顯示即時 FPS 與記憶體使用量，協助在瀏覽器端追蹤效能。

### 其他 UI 調整

- 偵測到後端離線時，頁面頂部會出現離線提示並提供重新連線按鈕，避免使用者誤以為資料最新。
- 即時數據卡片支援 `progress` 進度條，溫度／濕度／亮度會顯示相對目標值與提示標記。
- 趨勢圖支援滑鼠 hover crosshair 與 CSV 匯出，可跨指標同步觀察單一時間點。
- AI 聊天面板新增快速指令、收藏清單與記憶類型篩選，也支援全主題的深色玻璃風格。
- 記憶面板、設備檢測、校正向導等區塊在夜間 / 森林主題下改用半透明深色底，維持文字對比。
- 即時區域的「Realtime」膠囊搭配 `realtime-indicator` 脈衝燈，即時顯示 Idle／Connecting／Connected／Error。
- 各資料卡加入狀態徽章（正常／注意／警示）與顏色，搭配深色與森林主題調整對比。
- 新增「進階控制」區塊開關，可將感測器校正、自訂警報與效能監控收合在單一面板。
- AI 顧問、記憶庫與關鍵字雲改為可收合，維持頁面整潔並保留操作入口。
- 趨勢圖上方新增溫度與飲水重點小卡，顯示最新值、範圍與相較上一筆的變化方向。
- 感測資料若被自動校正或忽略，會於頁面頂部顯示警告訊息，並搭配提示音提醒使用者。

## 與硬體與後端整合
1. **韌體**：Arduino 草稿 `arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino` 會讀取 HC-SR04、ST021（I²C 溫濕度，失敗時自動改用 DHT11）、FSR、LDR，以及 DS3231 RTC；並可選配 ESP8266（AT 韌體）以 Wi-Fi 方式 POST 到後端。輸出的 JSON 每 5 秒包含 `timestampMs`，當 RTC 線路就緒時還會附 `timestampUnix`、`timestampIso` 與 `reading.raw.st021Ready`、`reading.raw.wifiConnected` 等診斷欄位。
2. **後端 API**：實作以下路由並啟用 CORS；可使用 Express、FastAPI 等框架。
   - `POST /api/preferences/language`：儲存使用者語言偏好。
   - `POST /api/push-subscriptions`：註冊 Web Push 訂閱，需搭配 VAPID 私鑰簽名。
   - `POST /api/equipment/test`：回應各設備連線狀態與延遲。
   - `GET /api/snapshot/latest`：前端儀表板取得最新感測資料。
   - （選擇性）`GET /api/history`：提供歷史資料給圖表或 AI。
   - `GET/POST/PATCH/DELETE /api/alert-rules`：管理自訂警報門檻與嚴重度。
   - `GET /api/memories/keywords`：回傳 AI 記憶熱門關鍵字雲資料。
   - `GET/POST/DELETE /api/chat/favorites`：收藏、列出或刪除聊天訊息星號。
   - `GET /api/diagnostics/report`：產生包含健康狀態、警報與收藏摘要的診斷報告（純文字）。
3. **前端調整**：
   - 在 `src/data/mockApi.ts` 將 `fetchSmartHomeSnapshot`、`applySettings` 改為呼叫上述 API。
   - 將 `src/data/equipment.ts` 的 `testEquipmentConnection` 替換為後端 `/api/equipment/test`。
   - 更新 `.env.local` 並重新啟動 Vite。
4. **推播設定**：伺服器需儲存 `VAPID_PRIVATE_KEY`/`PUBLIC_KEY`，透過 `web-push` 套件或等效工具發送通知；payload 中帶入 `language` 方便前端 service worker 套用正確語系。
5. **AI 對話 (可選)**：
   - 若有後端 LLM 服務，實作 `POST /api/chat/suggestions` 接口，回傳 `{ choices: [{ message: { role, content } }] }`。
   - 若使用 Ollama，可在 `.env.local` 設定 `VITE_OLLAMA_BASE_URL` 與 `VITE_OLLAMA_MODEL`（建議透過自簽或反向代理提供 HTTPS，避免瀏覽器阻擋混合內容；別忘了在 `/etc/hosts` 加上 `127.0.0.1 ollama.local` 等對應記錄）。

6. **Web Serial (Arduino 測試)**：
   - UI 透過 Web Serial 與 Arduino 互動，需要以 HTTPS（或 `http://localhost`）啟動 Vite，可使用 `mkcert` 自簽憑證。
   - Arduino 韌體需支援簡單的 `PING` → `PONG` 回應（參照 `設備連線檢測` 面板說明），並「每次送出完整的 `SmartHomeReading` 物件」，至少包含：`temperatureC`、`humidityPercent`、`waterIntakeMl`、`airQualityIndex`、`catWeightKg`、`lastFeedingMinutesAgo`、`timestamp`（ISO 字串或毫秒時間戳，建議 ≥ `10^12`）。
   - 其餘選填欄位（例如 `waterLevelPercent`、`ambientLightPercent`、`catPresent`、raw 值）可依實際感測器補齊；缺少 `waterIntakeMl` 等欄位時，後端序列橋會拒收資料。若有 RTC，建議一併傳回 `timestampUnix`／`timestampIso`。
  - 記得在 `smart-cat-backend/.env` 設定 `SERIAL_ENABLED=true`、對應的 `SERIAL_PORT=/dev/tty.usbmodemXXXX` 與 `SERIAL_BAUD`（目前草稿與後端皆預設 115200 bps）。
   - 校正數值可透過儀表板的「感測器校正」區塊儲存（例如 LDR 暗/亮原始值、超音波距離、FSR 比例），韌體可參考這些設定計算實際數值。

### 使用外接 ESP8266 Wi-Fi 模組（AT 指令）

若硬體是「Arduino 板 + ESP8266 無線模組」而非 NodeMCU/D1 mini，請以 AT 指令方式連線，**不要**在 UNO/Mega 韌體直接 `#include <ESP8266WiFi.h>`。建議做法：

1. 將 ESP8266 以 3.3V 供電並透過硬體序列（Mega 可用 `Serial1`）或 SoftwareSerial（UNO 預設 `RX=D8`、`TX=D9`）接至主板，並先把模組的預設鮑率改成 115200（`AT+UART_DEF=115200,8,1,0,0`）。
2. 在 `smart_cat_serial_bridge.ino` 內填好 `WIFI_SSID`、`WIFI_PASSWORD`、`BACKEND_HOST`（例如 `192.168.0.198`）、`BACKEND_PORT`，草稿會自動執行 `AT`、`AT+CWJAP`、`AT+CIPSTART`、`AT+CIPSEND`，將同樣的 JSON 貼到 `http://<後端IP>:<PORT>/api/snapshots`。如需確認 IP，可在後端主機執行 `ifconfig`/`ipconfig` 取得區網位址，並確保路由器與防火牆允許該埠存取。
3. 序列監控會顯示 `{"esp8266":"response",...}` 與 `wifiConnected=true` 等狀態，方便確認連線成功；若後端仍需序列橋備援，仍可保持 USB 連線並由後端同時接收資料。
4. 若希望直接使用 `ESP8266WiFi.h` / `HTTPClient` 等高階函式庫，請改用 NodeMCU、Wemos D1 mini 或將韌體直接燒錄到 ESP8266，本專案不支援在 UNO/Mega 上直接 include 該標頭。

> ℹ️ **注意**：未設定 `VITE_API_BASE_URL` 時，預設不再回傳模擬資料。若想在沒有硬體/後端的環境快速體驗 UI，請於 `.env.local` 設 `VITE_ENABLE_MOCKS=true`。  
> 👉 若要顯示「設備連線檢測」面板並執行硬體測試，請在 `.env.local` 同步開啟 `VITE_ENABLE_EQUIPMENT_DIAGNOSTICS=true`。

### PWA / 通知測試建議

- 在 macOS／Windows 上以 `https://localhost:5173` 開啟，可立即看到瀏覽器的「加到主畫面」或安裝提示；請保留 `localhost+2.pem` 憑證並在第一次開啟時允許瀏覽器信任，Service Worker 才能註冊並處理推播。  
- 若要讓 Android 以區網 IP 安裝 PWA，請用 `mkcert 172.28.x.x` 產生含 IP 的憑證，並將 `mkcert -CAROOT` 的根憑證匯入手機。完成後，用 `https://<IP>:5173` 造訪即可從 Chrome 選單加入主畫面。  
- 當暫時改回 HTTP（將憑證檔改名或移除）時，UI 仍可使用，但瀏覽器會停用 Service Worker／推播／離線快取；恢復 HTTPS 後重新整理即可重新註冊。

### 自訂警報與收藏工具

- 「自訂警報規則」面板呼叫 `/api/alert-rules` 進行 CRUD，後端會將規則套用到每筆快照並於警報訊息後附上 `[rule-<id>]` 方便追蹤。
- 「記憶關鍵字雲」透過 `/api/memories/keywords` 取得 TF‑IDF + 類型加權的熱門詞彙，點擊「重新分析」即可即時更新。
- 聊天面板支援星號收藏，資料由 `/api/chat/favorites` 管理並顯示於訊息輸入框上方；收藏內容也會包含在診斷報告中。
- 通知排錯導覽新增「下載診斷報告」按鈕，呼叫 `/api/diagnostics/report` 匯出純文字摘要（健康狀態、工具事件、自訂警報、修復紀錄與收藏）。

### 🎨 使用新的 UX 組件

專案新增了三個改善使用者體驗的組件，詳細使用說明請參考 `/Users/meaqua/Desktop/EE3070/UX_IMPROVEMENTS.md`。

#### 1. SkeletonLoader - 載入動畫

在資料載入時顯示優雅的骨架屏：

```tsx
import { SkeletonLoader } from './components/SkeletonLoader'

{loading ? (
  <SkeletonLoader variant="card" count={3} />
) : (
  <DataCard data={data} />
)}
```

支援四種變體：`card`（卡片）、`chart`（圖表）、`text`（文字）、`circle`（圓形）

#### 2. Toast 通知系統

首先在 `src/main.tsx` 中整合 ToastProvider：

```tsx
import { ToastProvider } from './components/ToastProvider'

root.render(
  <StrictMode>
    <ToastProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ToastProvider>
  </StrictMode>
)
```

在組件中使用：

```tsx
import { useToast } from './hooks/useToast'

function MyComponent() {
  const { showToast } = useToast()

  const handleSuccess = () => {
    showToast('success', '設定已儲存！', 5000)
  }

  const handleError = () => {
    showToast('error', '連線失敗，請稍後再試')
  }
}
```

支援四種類型：`success`、`error`、`warning`、`info`

#### 3. 確認對話框

首先在 `src/main.tsx` 中整合 ConfirmDialogProvider：

```tsx
import { ConfirmDialogProvider } from './components/ConfirmDialog'

root.render(
  <StrictMode>
    <ToastProvider>
      <ConfirmDialogProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  </StrictMode>
)
```

在組件中使用：

```tsx
import { useConfirm } from './hooks/useConfirmDialog'

function MyComponent() {
  const { showConfirm } = useConfirm()

  const handleDelete = () => {
    showConfirm({
      title: '確認刪除',
      message: '此操作無法復原，確定要繼續嗎？',
      type: 'danger',
      confirmText: '刪除',
      cancelText: '取消',
      onConfirm: async () => {
        await deleteData()
        showToast('success', '已刪除')
      }
    })
  }
}
```

支援三種類型：`danger`（危險）、`warning`（警告）、`info`（資訊）


## Capacitor（iOS / Android）

已在專案新增 Capacitor 基礎設定（`capacitor.config.ts` 與 npm scripts），方便將現有 React 應用包成原生殼。由於目前開發環境無法直接存取 npm registry，請在具備網路的機器上執行以下指令完成安裝與平台生成：

```bash
# 安裝依賴（會根據 package.json 安裝 Capacitor 套件）
npm install

# 建置前端資源，輸出到 dist/
npm run build

# 初始化或更新 Capacitor 專案資訊（若需重新指定 appId/appName）
npx cap init smart-cat-home com.smartcathome.app --web-dir=dist

# 第一次加入原生專案
npx cap add ios
npx cap add android

# 每次更新前端後同步到原生專案
npx cap copy
npx cap sync

# 於 Xcode / Android Studio 開啟並編譯
npx cap open ios
npx cap open android
```

注意事項：

- `capacitor.config.ts` 預設 `webDir=dist`、`appId=com.smartcathome.app`、`appName=Smart Cat Home`，可依實際 bundle ID 調整。
- 若要連線本機或局域網後端，請確認手機/模擬器能存取 HTTPS 端點並信任憑證（或使用 tunneling 工具）。如需暫時允許 HTTP，可在 `capacitor.config.ts` 的 `server` 欄位調整。
- 推播功能在 WebView 中仍可使用現有 Web Push，但若要上架 App Store / Google Play，建議額外整合 Capacitor Push Notifications 插件並讓後端支援 APNs / FCM。

### Android 模擬器連線宿主機（HTTPS）

1. **推送憑證並安裝**  
   執行 `./scripts/push-avd-cert.sh`，預設會將 `certs/localhost+2.pem` 轉為 DER 並推送成 `/sdcard/Download/smart-cat-home-ca.cer`。在模擬器中前往「設定 → 安全 → 加密與憑證 → 從儲存空間安裝 → CA 憑證」，選取該檔案後重新啟動 AVD。

2. **固定 Base URL**  
   - `capacitor.config.ts`（以及 `android/app/src/main/assets/capacitor.config.json`）在開發模式下會自動把 `server.url` 指向 `https://10.0.2.2:5173`，確保 WebView 走 `10.0.2.2` 回宿主機。  
   - `.env.local` 已在 `VITE_API_BASE_URL_MAP` 添加 `10.0.2.2:5173=https://10.0.2.2:4000`，因此前端在模擬器中也會改呼叫同一個 API。

3. **允許新來源登入**  
   後端 `.env` 的 `ALLOWED_ORIGINS` 已加入 `http://10.0.2.2:5173` 與 `https://10.0.2.2:5173` 避免 CORS 擋下登入/推播。若你改用其他 port 或域名，記得同步更新此列表。

4. **啟動流程**  
   - `smart-cat-backend`: `npm run dev`  
   - `smart-cat-home`: `npm run dev -- --host --port 5173 --https --cert certs/localhost+2.pem --key certs/localhost+2-key.pem`  
   - 執行 `npx cap sync android && npx cap open android`，在 Android Studio 裡啟動模擬器，並確認步驟 1 的 CA 已安裝。

如要改走區網 IP 或實際網域，可再將對應 host 加進 `.env.local` 的 `VITE_API_BASE_URL_MAP` 以及後端 `.env` 的 `ALLOWED_ORIGINS`。

### 原生 App 推播（Capacitor）

1. 安裝套件並同步原生專案：`npm install @capacitor/push-notifications && npx cap sync ios android`。
2. iOS：在 Xcode 的 `Signing & Capabilities` 加入 **Push Notifications** 與 **Background Modes → Remote notifications**，同時準備 Apple Developer 的 APNs Auth Key，並在後端 `.env` 設定 `APNS_*` 相關欄位。
3. Android：依 Firebase Console 建立專案，下載 `google-services.json` 放入 `android/app/`，後端則填入 `FCM_SERVICE_ACCOUNT_PATH` 或 `FCM_SERVICE_ACCOUNT_BASE64` 以便發送通知。
4. 將後端 `NATIVE_PUSH_ENABLED=true` 並重啟；App 內點「啟用背景通知」時，前端會呼叫 `PushNotifications.register()`，token 會經由 `/api/push-subscriptions` 儲存到 `native_push_devices`，之後自動警報即可同時推送至 Web 與 iOS/Android。

## 測試與建置
```bash
npm run build
npm run preview
```

### AI 回覆快速測試

後端啟動後，可執行：

```bash
cd smart-cat-backend
node scripts/chat_smoke_test.js
```

會對 `/api/chat/suggestions` 送出數個中英文情境，檢查是否成功回覆。

## 其他資源
- [Arduino IDE 下載](http://arduino.cc/en/Main/Software)
- ESP8266 / ESP32 官方文件與範例程式
- `src/utils/backendClient.ts`、`src/utils/pushNotifications.ts`：封裝好的 API 呼叫與推播註冊邏輯，可作為整合參考。

歡迎依照實際硬體情境擴充，包含串接 WebSocket、MQTT、或更多感測模組。
