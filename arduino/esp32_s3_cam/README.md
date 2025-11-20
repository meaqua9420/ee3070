# Smart Cat ESP32-S3 CAM

本資料夾提供一份專為 ESP32-S3-CAM（例如 ESP32-S3-EYE）設計的草稿程式，用於：

- 透過 OV2640 感測器擷取影像並執行輕量化機器學習推論（邏輯迴歸模型，輸入為亮度、對比與邊緣密度）
- 將偵測結果推送回 Smart Cat Backend（`POST /api/camera/events`）
- 暴露 HTTP 介面（`/status`、`/snapshot.jpg`）供前端或後端拉流顯示
- 於偵測到貓咪時觸發機板 LED 提示

> ⚠️ **注意**：請先將 `camera_credentials.h.example` 複製為 `camera_credentials.h` 並填入 Wi-Fi 與後端參數。

## 快速開始

1. **硬體需求**
   - ESP32-S3-CAM 模組（預設腳位為 ESP32-S3-EYE，如使用其他板子請修改腳位定義）
   - OV2640 攝影鏡頭
   - 2.4GHz Wi-Fi
   - （選配）外接 5V/USB 供電

2. **建置步驟**
   ```bash
   cp camera_credentials.h.example camera_credentials.h
   # 編輯 camera_credentials.h，填入 Wi-Fi、後端位址與 API Key
   ```

   在 Arduino IDE / PlatformIO 中：
   - 板子：`ESP32S3 Dev Module`
   - Flash Mode：**QIO**
   - Flash Size：**8MB (PSRAM: 8MB)**
   - Partition Scheme：**Huge APP (3MB No OTA/1MB SPIFFS)**
   - Arduino IDE 額外參數：
     - `PSRAM: Enabled`
     - `USB CDC On Boot: Enabled`（方便序列監控）

3. **API**
   - `GET /status`：回傳目前的偵測數值、機率、Wi-Fi 強度
   - `GET /snapshot.jpg`：即時 JPEG 擷取（320x240）
   - `GET /healthz`：健康檢查
- `POST /api/camera/events`（後端）：
  ```json
  {
    "deviceId": "esp32-s3-cam-01",
    "catDetected": true,
    "probability": 0.87,
    "mean": 108.4,
    "stdDev": 34.2,
    "edgeDensity": 28.5,
    "timestampMs": 1700000123
  }
  ```
- 若 `camera_credentials.h` 設定了 `CAMERA_API_KEY`，裝置會要求所有 HTTP 存取帶上 `Authorization: Bearer <CAMERA_API_KEY>`，請與後端 `.env` 的 `CAMERA_API_KEY` 保持一致。

## 機器學習推論

程式在裝置端計算三個特徵：

1. 影像平均亮度（mean）
2. 亮度標準差（stdDev）：反映對比度
3. 邊緣密度（edgeDensity）：簡易判斷輪廓複雜度

透過輕量化邏輯迴歸模型（參數可於原始碼 `MODEL_*` 常數調整）計算出貓咪出現的機率。預設臨界值 `0.62`，可在 `camera_credentials.h` 調整 `CAMERA_CAT_THRESHOLD`。

若距離上次上報超過 8 秒且偵測結果變動或機率超過 0.8，模組會主動呼叫後端 API。

## 整合建議

- 後端接收到事件後，會更新最新快照並轉換為前端儀表板的「視覺狀態」欄位。
- 前端可透過新增的控制面板檢視即時縮圖、查看機率曲線，並遠端觸發 8802B 音訊功放呼喚貓咪。
- 若需串流 MJPEG，可在本程式基礎上加入 `stream` handler（目前預設提供靜態快照，避免佔用帶寬）。

## 疑難排解

- 無法連上 Wi-Fi：確認 `camera_credentials.h` 的 SSID / 密碼是否正確，或在序列監控檢查 RSSI。
- 圖像過暗：可調整 `sensor->set_brightness`、`sensor->set_exposure_ctrl` 等參數。
- 偵測不準：於後端儲存結果後可匯出資料重新訓練（例如在 Python 以 `scikit-learn` 重新擬合並更新 `MODEL_*` 常數）。

歡迎依需求調整解析度、推論模型或事件頻率，以符合實際場域的網路與運算限制。
