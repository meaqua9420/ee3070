# Smart Cat Home Dashboard

Smart Cat Home 是針對智慧貓屋打造的 React + TypeScript 應用，支援 Arduino/ESP8266 感測資料、Autoset 控制、AI 健康建議、AI 對話建議，以及設備連線檢測與推播通知。

## 功能重點
- 📊 **即時儀表板**：展示溫度、濕度、飲水量、體重、空氣品質、餵食間隔等數據，並保留 24 小時歷史趨勢。
- 🤖 **AI 健康顧問**：根據感測指標回傳本地規則或 fine-tune 模型建議，支援中英文切換。
- 💬 **AI 對話**：透過後端 LLM 或 Ollama 與 AI 顧問聊天，獲得排程與照護建議。
- 🔧 **Autoset 控制**：調整環境目標值、餵食排程與自動模式，更新後可同步給後端與硬體裝置。
- 🌐 **多語系介面**：提供中文/英文介面，支援使用者記錄語言偏好與推播語系。
- 📡 **設備檢測**：一次測試 Wi-Fi 路由器、Arduino 主板、感測器、顯示器、RFID 系統等設備連線狀態。
- 🔔 **推播通知**：整合 Service Worker + VAPID，當感測數值異常時自動推送警示。

## 開發環境
```bash
npm install
npm run dev -- --host --port 5181
```

> 若專案資料夾內存在 `localhost+2.pem`／`localhost+2-key.pem`，Vite 會使用這對自簽憑證啟動 HTTPS。第一次以 Chrome 開啟時，需要在瀏覽器選擇「進階」→「繼續前往」以信任本機憑證。若想改回 HTTP，可暫時移動/改名這兩個檔案後重新啟動 dev server。

建議在 `smart-cat-home/.env.local` 設定下列變數：
```
VITE_API_BASE_URL=https://localhost:4000
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
# 本機 demo 或教學可啟用模擬資料；若要使用真實感測資料請移除或設為 false
VITE_ENABLE_MOCKS=true
# 若使用本機 Ollama 作為 AI 顧問，可改用以下設定
VITE_OLLAMA_BASE_URL=https://your-ollama-host:11434
VITE_OLLAMA_MODEL=llama3
```
可直接複製 `.env.local.example` 後按需要修改。

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
SERIAL_BAUD=9600                    # 與韌體一致
```
若要以 HTTPS 服務，並與前端同一張自簽憑證協作，可額外設定：
```
HTTPS_CERT_PATH=../smart-cat-home/localhost+2.pem
HTTPS_KEY_PATH=../smart-cat-home/localhost+2-key.pem
```
重載 `.env` 後再啟動 `npm run dev`，即可在 `https://localhost:4000` 上提供 API。

## 與硬體與後端整合
1. **韌體**：Arduino + ESP8266/ESP32 撰寫程式，定時將感測 JSON (溫度、濕度、飲水量等) 透過 Wi-Fi 上傳到後端，例如 `POST /api/snapshots`。
2. **後端 API**：實作以下路由並啟用 CORS；可使用 Express、FastAPI 等框架。
   - `POST /api/preferences/language`：儲存使用者語言偏好。
   - `POST /api/push-subscriptions`：註冊 Web Push 訂閱，需搭配 VAPID 私鑰簽名。
   - `POST /api/equipment/test`：回應各設備連線狀態與延遲。
   - `GET /api/snapshot/latest`：前端儀表板取得最新感測資料。
   - （選擇性）`GET /api/history`：提供歷史資料給圖表或 AI。
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
   - Arduino 韌體需支援簡單的 `PING` → `PONG` 回應（參照 `設備連線檢測` 面板說明）。

> ℹ️ **注意**：未設定 `VITE_API_BASE_URL` 時，預設不再回傳模擬資料。若想在沒有硬體/後端的環境快速體驗 UI，請於 `.env.local` 設 `VITE_ENABLE_MOCKS=true`。

## 測試與建置
```bash
npm run build
npm run preview
```

## 其他資源
- [Arduino IDE 下載](http://arduino.cc/en/Main/Software)
- ESP8266 / ESP32 官方文件與範例程式
- `src/utils/backendClient.ts`、`src/utils/pushNotifications.ts`：封裝好的 API 呼叫與推播註冊邏輯，可作為整合參考。

歡迎依照實際硬體情境擴充，包含串接 WebSocket、MQTT、或更多感測模組。
