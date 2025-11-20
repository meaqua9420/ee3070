# Smart Cat Home 整合進度報告
# Integration Progress Report

**更新時間**: 2025-11-14
**當前階段**: 階段 1 - Arduino 韌體修改
**進度**: 60% (Arduino 層面)

---

## ✅ 已完成

### 階段 1.1：Pin 重新分配（100% 完成）

#### 修改內容：
1. **UV/Fan Pin 重新分配**
   - `UV_LAMP_PIN`: D6 → D14 ✅
   - `UV_FAN_PIN`: D7 → D15 ✅
   - **原因**: 釋放 D6/D7 給餵食器按鈕使用

2. **新增餵食器按鈕**
   - `BTN_FEED_PIN = 3` ✅（手動餵食按鈕）
   - BTN_TARE_PIN、BTN_RESET_PIN、BTN_CAL_PIN 保持不變

3. **新增水合系統 Pin**
   - `WATER_PUMP_PIN = 22` ✅（繼電器控制水泵）
   - `WATER_SENSOR_PIN = A5` ✅（模擬水位傳感器）
   - `BTN_WATER_PIN = 23` ✅（手動補水按鈕）
   - `WATER_THRESHOLD = 400` ✅（水位閾值）

4. **定義新模組開關**
   - `#define ENABLE_HYDRATION 1` ✅

#### 檔案位置：
- `/Users/meaqua/Desktop/EE3070/arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino`
  - 第 180-181 行：UV/Fan Pin
  - 第 125-130 行：餵食器按鈕
  - 第 132-139 行：水合系統 Pin

---

### 階段 1.2：啟用餵食器和 RTC（100% 完成）

#### 修改內容：
1. **啟用 HX711 模組**
   - `#define ENABLE_HX711 1` ✅（原本 0）
   - HX711 程式碼已存在，無需額外添加

2. **啟用 DS3231 RTC**
   - `#define ENABLE_DS3231 1` ✅（原本 0）
   - RTC 程式碼已存在，無需額外添加

3. **已存在的餵食器功能（無需修改）**
   - ✅ HX711 重量讀取
   - ✅ 伺服馬達控制（開/關閘門）
   - ✅ 按鈕防抖機制
   - ✅ 硬體命令：`triggerFeed`、`tareFoodScale`、`calibrateFoodScale`
   - ✅ Tare/Reset/Calibrate 按鈕處理

#### 檔案位置：
- `/Users/meaqua/Desktop/EE3070/arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino`
  - 第 1 行：ENABLE_DS3231
  - 第 19 行：ENABLE_HX711

---

## 🔄 進行中

### 階段 1.3：新增水合系統代碼（30% 完成）

#### 需要添加：
1. **水合系統狀態結構** ⏳
   ```cpp
   struct HydrationState {
     int waterLevel;
     bool pumpActive;
     unsigned long lastRefillMs;
     bool hasPumpedMorning;
     bool hasPumpedNoon;
     bool hasPumpedAfternoon;
     bool hasPumpedEvening;
   };
   ```

2. **核心功能函數** ⏳
   - `readWaterLevel()` - 讀取水位
   - `startWaterPump(durationMs)` - 啟動水泵
   - `stopWaterPump()` - 停止水泵
   - `checkScheduledHydration()` - 檢查定時補水

3. **setup() 初始化** ⏳
   - pinMode 設定（WATER_PUMP_PIN, BTN_WATER_PIN）
   - 初始狀態設定

4. **loop() 整合** ⏳
   - 手動按鈕檢測
   - RTC 定時觸發（8:00/12:00/16:00/20:00）

5. **硬體命令處理** ⏳
   - 添加 `pumpWater` 到 `handleHardwareCommand()`

6. **Snapshot 數據擴展** ⏳
   - 添加 `waterTankLevelPercent` 到 JSON 輸出

---

## ⏱️ 待完成

### 階段 1.4：Arduino 整合測試（0%）
- [ ] 編譯驗證（無錯誤）
- [ ] 記憶體使用檢查（< 7KB SRAM）
- [ ] 序列埠輸出測試
- [ ] WiFi 命令接收測試
- [ ] 定時任務觸發測試

### 階段 2：後端 API 開發（0%）
- [ ] 資料庫 Migration（feeder_logs、hydration_logs、scheduled_tasks）
- [ ] TypeScript 型別擴展
- [ ] API 端點實現（8 個）
- [ ] 硬體命令隊列擴展

### 階段 3：前端 UI 開發（0%）
- [ ] FeederControlPanel.tsx
- [ ] HydrationControlPanel.tsx
- [ ] FeederStatusCard.tsx
- [ ] HydrationStatusCard.tsx
- [ ] 多語言翻譯
- [ ] App.tsx 整合

### 階段 4：測試驗證（0%）
- [ ] 單元測試
- [ ] 整合測試
- [ ] 壓力測試
- [ ] 邊界測試

---

## 📊 整體進度

```
Arduino 韌體:  ████████░░░░░░░░ 60%  (階段 1.1-1.2 完成)
後端 API:      ░░░░░░░░░░░░░░░░ 0%   (待開始)
前端 UI:       ░░░░░░░░░░░░░░░░ 0%   (待開始)
測試驗證:      ░░░░░░░░░░░░░░░░ 0%   (待開始)
─────────────────────────────────────
總進度:        ███░░░░░░░░░░░░░ 15%
```

---

## 🎯 下一步行動

### 立即執行（今日）：
1. ✅ 完成階段 1.3：新增水合系統代碼
2. ✅ 完成階段 1.4：Arduino 整合測試

### 近期計畫（本週）：
3. 階段 2.1：資料庫擴展
4. 階段 2.2：後端 API 端點

### 中期計畫（下週）：
5. 階段 3：前端 UI 開發
6. 階段 4：測試驗證

---

## ⚠️ 注意事項

### 硬體連接檢查清單（修改 Pin 後必須驗證）：
- [ ] **UV 燈連接到 D14**（不是 D6）
- [ ] **風扇連接到 D15**（不是 D7）
- [ ] 餵食器按鈕連接正確（D3/D6/D7/D8）
- [ ] 水泵繼電器連接到 D22
- [ ] 水位傳感器連接到 A5
- [ ] 補水按鈕連接到 D23

### 重要提醒：
⚠️ **重新上傳韌體後，必須重新連接 UV 燈和風扇的線路！**
⚠️ **D6 和 D7 現在用於餵食器按鈕，不再是 UV/Fan！**

---

## 📝 技術細節

### Pin 使用總覽（已分配）

| Pin | 功能 | 狀態 |
|-----|------|------|
| D2 | HC-SR04 Echo | ✅ 使用中 |
| D3 | BTN_FEED_PIN（餵食按鈕）| ✅ 新增 |
| D4 | DHT11 數據 | ✅ 使用中 |
| D5 | HX711 DT | ✅ 啟用 |
| D6 | BTN_CAL_PIN（校正按鈕）| ✅ 使用中 |
| D7 | BTN_TARE_PIN（去皮按鈕）| ✅ 使用中 |
| D8 | BTN_RESET_PIN（重置按鈕）| ✅ 使用中 |
| D9 | FEEDER_SERVO_PIN | ✅ 啟用 |
| D10 | HX711 SCK | ✅ 啟用 |
| D13 | HC-SR04 Trigger | ✅ 使用中 |
| D14 | UV_LAMP_PIN（UV 燈）| ✅ 重新分配 |
| D15 | UV_FAN_PIN（風扇）| ✅ 重新分配 |
| D18/D19 | ESP8266 Serial1 | ✅ 使用中 |
| D20/D21 | I2C (DS3231) | ✅ 啟用 |
| D22 | WATER_PUMP_PIN（水泵）| ✅ 新增 |
| D23 | BTN_WATER_PIN（補水按鈕）| ✅ 新增 |
| A1 | LDR（光感測器）| ✅ 使用中 |
| A5 | WATER_SENSOR_PIN（水位）| ✅ 新增 |

### 可用 Pin
- 數位：D11, D12, D16-D17, D24-D53
- 模擬：A0, A2-A4, A6-A15

---

**報告生成時間**: 2025-11-14
**作者**: Claude Code (Sonnet 4.5)
**專案**: Smart Cat Home - EE3070

**下次更新**: 完成階段 1.3 後
