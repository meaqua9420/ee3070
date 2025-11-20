# Smart Cat Serial Bridge – 硬體與後端設定指南

本資料夾包含 `smart_cat_serial_bridge/smart_cat_serial_bridge.ino` 草稿，用於將智慧貓屋的感測資料送往 Smart Cat Backend。以下說明如何佈線、設定韌體，以及讓後端接收資料。

---

## 1. 硬體總覽

| 元件 | 用途 |
| ---- | ---- |
| **Arduino UNO / Mega / 相容板** | 主要控制器 |
| **HC-SR04 超音波** | 水位量測 |
| **DHT11** | 主要溫濕度感測（Mega 草稿預設接 D24；UNO 可改接 D4 並調整 `DHT_PIN`） |
| **ST021（SHT21 相容 I²C）** | 選配溫濕度感測，如偵測成功會覆寫 DHT11 的缺漏值 |
| **LDR + 分壓電阻** | 環境亮度 |
| **FSR** | 貓咪重量／是否在屋內 |
| **DS3231 RTC** | 精準時間戳（提供 `timestampUnix` / `timestampIso`） |
| **ESP8266（AT 韌體）** | 選配 Wi-Fi 直傳 |
| **8802B 功放模組 + 8Ω 喇叭** | 遠端呼喚 / 安撫提示（PWM 音訊輸出） |
| **ESP32-S3-CAM（OV2640）** | 影像偵測、快照與後端事件上傳 |

> 草稿會同步輸出感測原始值到 `reading.raw`，方便後端或前端進行診斷。

---

## 2. 佈線建議

### 共通

- 5V 裝置（HC-SR04、FSR、LDR）供電接 Arduino 5V，GND 必須共地。
- ST021、DS3231 使用 I²C：SDA → A4（UNO）/ 20（Mega）、SCL → A5（UNO）/ 21（Mega），並上拉到 3.3~5V。
- **DHT11**：Mega 版草稿預設資料腳接 **D24**（`DHT_PIN = 24`）；若用 UNO/Nano，請改接 **D4** 並將 `DHT_PIN` 改為 `4`。
- 超音波：Trig → D13，Echo → D2（草稿使用中斷）。
- FSR、LDR 分別接 A2 / A1。

### ESP8266（Wi-Fi 選配）

1. **供電**：僅能 3.3V；建議使用穩壓模組（UNO 的 3.3V 腳在高載時可能不穩）。
2. **腳位**（預設 115200 bps）：
   - UNO/Nano：ESP8266 TX → D8、ESP8266 RX → D9（最好加分壓保護）、`GND` 共地。
   - Mega 2560：ESP8266 TX → RX1(19)、ESP8266 RX → TX1(18)。草稿會自動改用 `Serial1`。
3. **啟動**：CH_PD（CH_EN）拉到 3.3V，RST 可保持高電位。
4. **預設鮑率調整**：若模組預設其他速率，請透過序列終端送出 `AT+UART_DEF=115200,8,1,0,0`。

### 8802B 功放模組

- `AUDIO_SIGNAL_PIN`（預設 D11）接至 8802B 的信號輸入；建議串聯 220Ω 電阻後再進功放，避免直推。
- `AUDIO_ENABLE_PIN`（預設 D3）接至功放的 `SD`/`EN` 腳以控制啟閉；沒接啟閉腳時可將常數改為 `-1`。
- 功放與 Arduino 需共地，並確保喇叭阻抗符合模組規格。
- 可在 `smart_cat_serial_bridge.ino` 內調整預設音量與自訂旋律模式。

### ESP32-S3-CAM（以 ESP32-S3-EYE 腳位為例）

- 模組負責影像偵測與快照，請獨立供電（建議 5V/USB）。
- 上傳程式前記得先複製 `esp32_s3_cam/camera_credentials.h.example` 為 `camera_credentials.h` 並填入 Wi-Fi 與後端參數。
- 預設 `CAMERA_BASE_URL` 指向後端，由後端代理 `/api/camera/status` 與 `/api/camera/snapshot`。

---

## 3. 韌體設定

### 3.1 配置凭证文件

1. 複製 `credentials.h.example` 並重命名為 `credentials.h`：
   ```bash
   cd smart_cat_serial_bridge
   cp credentials.h.example credentials.h
   ```

2. 編輯 `credentials.h`，填入你的實際配置：

```cpp
// WiFi 配置
#define WIFI_SSID_STR "YourWiFi"
#define WIFI_PASSWORD_STR "YourPassword"

// 后端服务器配置
#define BACKEND_HOST_STR "192.168.0.198"
#define BACKEND_PORT_NUM 4000
#define BACKEND_PATH_STR "/api/snapshots"

// 🔒 API 认证密钥（强烈推荐）
#define BACKEND_API_KEY_STR "your-secret-api-key-here"
```

- `BACKEND_HOST_STR`：後端在區網中的 IP（可在後端主機執行 `ifconfig` 或 `ipconfig` 查詢）
- `BACKEND_API_KEY_STR`：API 認證密鑰，用於保護後端 API（參見下方安全性章節）
- `credentials.h` 已在 `.gitignore` 中，不會被上傳到 Git

### 3.2 啟用/禁用功能模組

打開 `smart_cat_serial_bridge.ino`，根據硬體配置調整：

```cpp
#define ENABLE_DS3231 1          // 無 RTC 可改 0
#define ENABLE_ST021 1           // 若未接 ST021，可改 0，只用 DHT11
#define ENABLE_ESP8266 1         // 若只用 USB/序列，不需 Wi-Fi 可改 0
#define ENABLE_AUDIO 1           // 接上 8802B 功放即可保留為 1；未接時改 0
#define ENABLE_HX711 1           // 預設開啟；若秤重未接好會自動略過忙碌檢查，可視需要改 0
```

### 3.3 感測器校準

根據需要修改感測器預設值：
- `waterLevelFullCm` / `waterLevelEmptyCm`：水位校準
- `catPresenceThresholdKg`：貓咪存在判定閾值
- `ldrDarkRef` / `ldrBrightRef`：光照校準

### 3.4 編譯上傳

所有序列鮑率預設 115200，如需變更請同步調整後端 `.env` 裡的 `SERIAL_BAUD`。

編譯並上傳草稿到 Arduino。

---

### 3.5 音訊指令與相機事件

- 後端經由 `/api/audio/*` 端點下發 `audioControl` 指令，韌體會自動切換模式或播放預設旋律（`call-cat`、`calm-chime`、`alert`）。
- `reading.audio` 會回傳最新的功放狀態（音量、是否靜音、最後觸發時間），前端儀表板可立即反映。
- 若啟用 ESP32-S3-CAM，請參考 `arduino/esp32_s3_cam/README.md` 上傳草稿；相機會將偵測事件送往後端 `/api/camera/events`，韌體端可透過 `reading.vision` 同步最新結果。

---

## 4. 後端設定

1. 進入後端專案：
   ```bash
   cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
   cp .env.example .env   # 若尚未建立
   ```
2. 依照需求調整 `.env`：
   ```env
   PORT=4000
   SERIAL_ENABLED=true            # 若使用 USB/序列
   SERIAL_PORT=/dev/tty.usbmodemXXXX
   SERIAL_BAUD=115200
   HARDWARE_API_KEY=your-secret-api-key
   ALLOWED_ORIGINS=localhost:5173,192.168.0.198:5173  # 視前端主機調整
   ```
   - 若改用 ESP8266 直傳，可將 `SERIAL_ENABLED` 設為 `false`，後端只需處理 HTTP `POST /api/snapshots`。
   - `HARDWARE_API_KEY` 必須與 `credentials.h` 的 `BACKEND_API_KEY_STR` 一致，後端才能驗證 `Authorization: Bearer ...` 標頭。
   - 後端啟動時會自動 `app.set('trust proxy', 1)`，若部署在 nginx/Cloudflare 後需提供正確的 `X-Forwarded-For`。
3. 安裝套件並啟動：
   ```bash
   npm install
   npm run dev      # 開發模式
   # 或 npm run build && npm start
   ```
4. 後端啟動後會在主控台顯示：
   - `[serial] Connected to ...`（序列模式）
   - `[serial] SERIAL_ENABLED not true, skipping serial bridge.`（純 Wi-Fi）
   - `CORS origins: ...`、`History retention ...` 等資訊。

---

## 5. 安全性設定 🔒

### 5.1 重要安全建議

#### 必須實施（高優先級）

1. **啟用 API 認證**
   - 在 `credentials.h` 中設置 `BACKEND_API_KEY_STR`
   - 使用強密鑰（建議至少 32 字符，包含字母、數字、符號）
   - 後端需同步配置相同的 API 密鑰進行驗證
   - Arduino 會在 HTTP 請求中加入 `Authorization: Bearer <your-key>` 頭

2. **保護 credentials.h 文件**
   - ⚠️ 絕對不要將 `credentials.h` 提交到 Git
   - 已在 `.gitignore` 中排除，但請雙重確認
   - 如需分享代碼，只分享 `credentials.h.example`

3. **網絡隔離**
   - 建議將 Arduino 和後端放在獨立的 VLAN 或專用網絡
   - 如果後端暴露到公網，務必使用 HTTPS 反向代理（nginx/Cloudflare）
   - 配置防火牆規則，限制訪問後端 API 的 IP 範圍

#### 建議實施（中優先級）

4. **定期更新固件**
   - 當前版本會在啟動時輸出：`{"version":"1.1.0"}`
   - 定期檢查是否有安全更新

5. **監控異常行為**
   - 注意後端日誌中的異常請求
   - 啟用速率限制（已內建：最多 60 條命令/分鐘，命令間隔 500ms）
   - 監控 `{"warning":"rateLimitExceeded"}` 警告

6. **物理安全**
   - Arduino 通過序列端口可訪問所有功能
   - 確保設備放置在安全位置，防止未授權物理訪問
   - 考慮禁用序列端口（僅使用 Wi-Fi）

### 5.2 內建安全功能

固件已實施以下安全保護：

| 功能 | 說明 | 代碼位置 |
| ---- | ---- | ---- |
| **輸入驗證** | 所有校準參數都有範圍檢查（例如 fsrZero: 0-1023, waterLevel: 1-50cm） | `processCalibrationCommand()` |
| **緩衝區保護** | 序列緩衝區限制 512 字節，防止溢出攻擊 | `handleSerialInput()` |
| **CRC 校驗** | ST021 感測器數據使用 CRC-8 驗證完整性 | `st021ReadRaw()` |
| **速率限制** | 命令冷卻 500ms，每分鐘最多 60 條命令 | `processJsonCommand()` |
| **傳感器防抖** | 超聲波傳感器連續失敗 5 次才使用緩存值 | `readDistanceCm()` |
| **時間溢出處理** | 正確處理 millis() 49.7 天溢出問題 | `loop()` |

### 5.3 已知限制

⚠️ **無法在當前硬體上解決的限制**：

1. **HTTP 明文傳輸**
   - ESP8266 AT 固件不支持 HTTPS（需要 ESP8266 原生編程）
   - **緩解措施**：使用專用內網、配置防火牆、啟用 API 密鑰

2. **WiFi 密碼明文**
   - ESP8266 AT 命令必須明文發送密碼
   - **緩解措施**：使用 WPA2/WPA3 加密的 WiFi、確保物理安全

3. **無 TLS 證書驗證**
   - 即使使用 HTTPS 代理，Arduino 無法驗證證書
   - **緩解措施**：在受信任的網絡環境中部署

### 5.4 生產環境檢查清單

部署前請確認：

- [ ] 已設置強 API 密鑰（`BACKEND_API_KEY_STR`）
- [ ] 後端已啟用對應的 API 密鑰驗證
- [ ] `credentials.h` 未被提交到版本控制
- [ ] Arduino 放置在物理安全的位置
- [ ] 後端配置了 IP 白名單或防火牆規則
- [ ] 已禁用不需要的功能模組（如無 RTC 則 `ENABLE_DS3231 0`）
- [ ] 後端日誌監控已配置
- [ ] 定期備份後端 SQLite 資料庫

---

## 6. 驗證流程

1. **序列監控**：開啟 Arduino IDE 的 Serial Monitor（115200 bps），可觀察：
   - `{"status":"ready","version":"1.1.0", ...}` 表示草稿初始化完成
   - `{"esp8266":"response", ...}`、`wifiConnected:true/false`，了解 Wi-Fi 狀態
   - 每 5 秒一次的 `{"reading":{...}}`，為送往後端的 JSON
2. **後端日誌**：看到 `[snapshot] stored ...` 代表資料已存入 SQLite
3. **前端儀表板**：啟動 `smart-cat-home` 的 `npm run dev`，檢視各儀表卡是否顯示最新快照
4. **REST 測試**：可在後端主機或同網段裝置執行：
   ```bash
   curl -H "Authorization: Bearer your-api-key" http://192.168.0.198:4000/api/snapshot/latest
   ```
   若能取得 JSON，即代表 Wi-Fi 上傳成功

---

## 7. 常見問題

| 現象 | 排查 |
| ---- | ---- |
| 序列監控只有 `{"status":"ready"}`，之後沒資料 | 檢查感測器接線與供電，或查看是否被 `handleSerialInput()` 阻塞；草稿預設 5 秒送一次，忽略失敗的超音波會回傳 `-1` |
| `wifiConnected` 一直是 `false` | 確認 ESP8266 鮑率已設為 115200、SSID/密碼是否正確、後端是否能從 ESP8266 所在子網路存取；在序列監控中會顯示 AT 指令回應 |
| 後端日誌出現 `Origin not allowed` | 將前端或 ESP8266 來源加入 `.env` 的 `ALLOWED_ORIGINS`（例如 `192.168.0.0/24` 的瀏覽器需要加上 `192.168.0.xxx:5173`） |
| `/api/snapshots` 回應 413 | 表示 JSON 體積超過 `JSON_BODY_LIMIT`（預設 12mb）。確認是否傳送了不必要的 base64 資料，或在 `.env` 調高 `JSON_BODY_LIMIT` |
| RTC 時間錯亂 | 透過 `ds3231` 工具或程式初始化時間，或在草稿 `setup()` 內調整（草稿在偵測 `lostPower()` 時會用編譯時刻填充） |
| 後端返回 401 Unauthorized | 檢查 `BACKEND_API_KEY_STR` 是否與後端配置一致，確保沒有多餘空格或引號 |
| 序列監控出現 `rateLimitExceeded` | 命令發送過於頻繁，請降低命令頻率（每分鐘最多 60 條，間隔至少 500ms） |

---

## 8. 進階功能

- **遠端設定更新**：後端呼叫 `/api/settings` 或 `/api/calibration` 成功後，會自動透過序列橋或 Wi-Fi 指令通知 Arduino，回傳 JSON `{"type":"updateSettings",...}` 或 `{"type":"updateCalibration",...}`。草稿內建 `z`（FSR 歸零）、`c`（2 kg 校準）、`f`（餵食計時歸零）手動指令。
- **診斷欄位**：`reading.raw` 內含 `ldrAdc`、`fsrAdc`、`distanceCm`、`st021Ready`、`wifiConnected`，可用於前端警示或後端日誌排錯。
- **RTC 與時間戳**：若 DS3231 正常，草稿會同步輸出 `timestampUnix`、`timestampIso`，後端會優先使用這些資訊更新歷史記錄。

---

完成上述設定後，智慧貓屋即可透過 USB 或 Wi-Fi 穩定地把感測資料送進 Smart Cat Backend，前端儀表板也能即時顯示最新狀態。仔細跟隨步驟，就能快速完成部署。祝開發順利！ 🐾
