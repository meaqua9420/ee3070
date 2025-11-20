# UV 燈和風扇硬體診斷指南
# UV Lamp & Fan Hardware Diagnostic Guide

**日期**: 2025-11-14
**版本**: 1.0
**適用於**: Smart Cat Home - UV/Fan 控制問題排查

---

## 📋 目錄

1. [問題概述](#問題概述)
2. [軟體診斷工具](#軟體診斷工具)
3. [硬體檢查清單](#硬體檢查清單)
4. [萬用表測量指引](#萬用表測量指引)
5. [故障排除流程](#故障排除流程)
6. [常見問題與解決方案](#常見問題與解決方案)

---

## 🔍 問題概述

### 症狀
- **症狀 1**: Web 介面顯示「關閉」，但實際 UV 燈「開啟」
- **症狀 2**: 無法透過 Web 介面控制 UV 燈和風扇

### 初步診斷結果
經過詳細的代碼審查，**所有軟體邏輯與硬體設計圖完全匹配且正確**。因此問題應該出在：
1. 硬體接線錯誤或鬆脫
2. MOSFET 接法錯誤（Source/Drain 接反）
3. MOSFET 型號錯誤（P-channel vs N-channel）
4. 實際接線與設計圖不符

---

## 🛠️ 軟體診斷工具

### 工具 1：除錯版韌體（已修改）

**檔案位置**: `/Users/meaqua/Desktop/EE3070/arduino/smart_cat_serial_bridge/smart_cat_serial_bridge.ino`

**修改內容**: 在 `uvFanApplyOutputs` 函數（第 1321-1372 行）添加了詳細日誌

**使用方法**:
1. 重新編譯並上傳韌體到 Arduino
2. 打開序列埠監視器（115200 baud）
3. 透過 Web 介面切換 UV 燈或風扇
4. 觀察序列埠輸出的 `[UV_DEBUG]` 訊息

**日誌範例**:
```
[UV_DEBUG] Input: uvOn=true, fanOn=false
[UV_DEBUG] Computed levels: lampLevelHigh=HIGH, fanLevelHigh=LOW
[UV_DEBUG] Pin write: Pin 6 -> HIGH, Pin 7 -> LOW
[UV_DEBUG] Pin readback: Pin 6 reads HIGH, Pin 7 reads LOW
[UV_DEBUG] Final state: uvFanState.uvOn=true, uvFanState.fanOn=false
[UV_DEBUG] ===== End of uvFanApplyOutputs =====
```

**診斷要點**:
- ✅ 如果 `Input: uvOn=true`，`Pin write: Pin 6 -> HIGH`，實際 UV 燈開啟 → **軟體正常**
- ❌ 如果 `Input: uvOn=true`，`Pin write: Pin 6 -> HIGH`，實際 UV 燈關閉 → **硬體問題**
- ❌ 如果 `Input: uvOn=false`，`Pin write: Pin 6 -> LOW`，實際 UV 燈開啟 → **硬體極性相反**

### 工具 2：獨立 Pin 測試程式（新建）

**檔案位置**: `/Users/meaqua/Desktop/EE3070/arduino/uv_fan_pin_test/uv_fan_pin_test.ino`

**功能**:
- 每 2 秒自動切換 Pin 6 和 Pin 7 的 HIGH/LOW 狀態
- 輸出詳細日誌
- 排除複雜邏輯的干擾

**使用方法**:
1. **暫時停用原本的韌體**，上傳此測試程式
2. 打開序列埠監視器（115200 baud）
3. 觀察日誌並對照實際 LED/Fan 行為
4. 測試完成後，重新上傳原本的韌體

**預期行為**:
```
Time: 0 seconds
Target State: OFF (關閉)
Pin 6 (UV) output: LOW (0V)
Pin 7 (Fan) output: LOW (0V)
Expected: UV LED OFF, Fan OFF

Time: 2 seconds
Target State: ON (開啟)
Pin 6 (UV) output: HIGH (5V)
Pin 7 (Fan) output: HIGH (5V)
Expected: UV LED ON, Fan ON
```

**診斷結果**:
- ✅ 日誌 HIGH → 實際 ON：正常
- ✅ 日誌 LOW → 實際 OFF：正常
- ❌ 日誌 HIGH → 實際 OFF：硬體連接問題
- ❌ 日誌 LOW → 實際 ON：極性相反
- ❌ 無論日誌如何，狀態不變：連接失效

---

## ✅ 硬體檢查清單

### 基本檢查

#### 1. 電源供應
- [ ] Arduino 5V 輸出正常（用萬用表測量 5V pin）
- [ ] Arduino GND 接地良好
- [ ] DS3231 VCC 連接到 Arduino 5V
- [ ] UV LED 正極連接到 Arduino 5V
- [ ] Fan 正極連接到 Arduino 5V

#### 2. MOSFET #1 (UV LED)
- [ ] MOSFET Source 連接到 GND
- [ ] MOSFET Drain 連接到 UV LED 負極
- [ ] MOSFET Gate 連接到 Arduino **Pin 6** （透過 220Ω 電阻）
- [ ] 10kΩ pull-down 電阻從 Gate 連接到 GND
- [ ] 1N4007 二極體跨接 LED 端子（cathode 接正極，anode 接負極）

#### 3. MOSFET #2 (Fan)
- [ ] MOSFET Source 連接到 GND
- [ ] MOSFET Drain 連接到 Fan 負極
- [ ] MOSFET Gate 連接到 Arduino **Pin 7** （透過 220Ω 電阻）
- [ ] 10kΩ pull-down 電阻從 Gate 連接到 GND
- [ ] 1N4007 二極體跨接 Fan 端子（cathode 接正極，anode 接負極）

#### 4. MOSFET 方向檢查
- [ ] 確認使用的是 **N-channel** MOSFET（不是 P-channel）
- [ ] MOSFET 的三支腳位正確識別（Gate, Drain, Source）
- [ ] 查閱 MOSFET datasheet 確認腳位配置

#### 5. 接線完整性
- [ ] 所有跳線連接牢固（無鬆脫）
- [ ] 麵包板接觸良好（無氧化或髒污）
- [ ] 220Ω 電阻位置正確（Pin 到 Gate 之間）
- [ ] 10kΩ 電阻位置正確（Gate 到 GND 之間）

---

## 🔬 萬用表測量指引

### 準備工作
- 萬用表一支
- 上傳**測試程式** (`uv_fan_pin_test.ino`)
- 準備筆記記錄測量值

### 測量步驟

#### 步驟 1：測量 Arduino Pin 輸出電壓

**目的**: 驗證 Arduino Pin 6 和 Pin 7 能正確輸出 HIGH (5V) 和 LOW (0V)

1. 上傳測試程式並打開序列埠監視器
2. 將萬用表設定為 **直流電壓 (DC Voltage)** 模式，範圍 20V
3. **黑色探棒** 接 Arduino GND
4. **紅色探棒** 接 Arduino Pin 6

**測量並記錄**:
- 當序列埠顯示 `Pin 6 output: HIGH` 時，測量電壓 = ______ V（應為 ~5V）
- 當序列埠顯示 `Pin 6 output: LOW` 時，測量電壓 = ______ V（應為 ~0V）

5. 重複測量 Pin 7
- 當序列埠顯示 `Pin 7 output: HIGH` 時，測量電壓 = ______ V（應為 ~5V）
- 當序列埠顯示 `Pin 7 output: LOW` 時，測量電壓 = ______ V（應為 ~0V）

**判斷**:
- ✅ 如果測量值正確（HIGH ≈ 5V, LOW ≈ 0V）→ Arduino Pin 正常
- ❌ 如果測量值異常 → Arduino Pin 故障或被佔用

---

#### 步驟 2：測量 MOSFET Gate 端電壓

**目的**: 驗證訊號能正確傳遞到 MOSFET Gate

1. 保持測試程式運行
2. **黑色探棒** 接 GND
3. **紅色探棒** 接 **MOSFET #1 的 Gate 端**（220Ω 電阻之後）

**測量並記錄**:
- 當 Pin 6 輸出 HIGH 時，MOSFET #1 Gate 電壓 = ______ V（應為 ~4.8-5V）
- 當 Pin 6 輸出 LOW 時，MOSFET #1 Gate 電壓 = ______ V（應為 ~0V）

4. 重複測量 MOSFET #2 的 Gate
- 當 Pin 7 輸出 HIGH 時，MOSFET #2 Gate 電壓 = ______ V（應為 ~4.8-5V）
- 當 Pin 7 輸出 LOW 時，MOSFET #2 Gate 電壓 = ______ V（應為 ~0V）

**判斷**:
- ✅ 如果 Gate 電壓與 Pin 輸出一致 → 訊號傳遞正常
- ❌ 如果 Gate 電壓永遠是 0V → 220Ω 電阻斷路或 Gate 未連接
- ❌ 如果 Gate 電壓永遠是 5V → 短路問題
- ⚠️ 如果 Gate 電壓明顯低於 Pin 輸出（例如 Pin=5V 但 Gate=1V）→ 電阻值錯誤或 MOSFET 損壞

---

#### 步驟 3：測量 MOSFET Drain 端電壓

**目的**: 驗證 MOSFET 開關功能

1. **黑色探棒** 接 GND
2. **紅色探棒** 接 **MOSFET #1 的 Drain 端**（連接 UV LED 負極）

**測量並記錄**:
- 當 Gate = HIGH（MOSFET 應導通）時，Drain 電壓 = ______ V（應為 ~0-0.2V，接近 GND）
- 當 Gate = LOW（MOSFET 應截止）時，Drain 電壓 = ______ V（應為 ~5V，負載浮空）

**預期行為**（N-channel MOSFET 低側開關）:
- Gate HIGH → MOSFET 導通 → Drain 接地 (0V) → 電流流過負載 → LED 亮
- Gate LOW → MOSFET 截止 → Drain 浮空 (5V) → 無電流 → LED 滅

**判斷**:
- ✅ 如果 Drain 電壓符合預期，且 LED 行為正確 → MOSFET 正常工作
- ❌ 如果 Gate HIGH 但 Drain 仍是 5V → MOSFET 未導通（可能 Source/Drain 接反或 MOSFET 損壞）
- ❌ 如果 Gate LOW 但 Drain 是 0V → MOSFET 永久導通（損壞）
- 🔄 **如果 Drain 電壓正確，但 LED 行為相反**（Drain=0V 時 LED 滅，Drain=5V 時 LED 亮）→ **LED 可能接反或使用了反相電路**

---

#### 步驟 4：測量負載端（UV LED 和 Fan）

**目的**: 驗證負載本身沒有問題

1. **直接供電測試 UV LED**:
   - 將 UV LED 正極直接連到 Arduino 5V
   - 將 UV LED 負極直接連到 GND
   - 觀察 LED 是否點亮

2. **直接供電測試 Fan**:
   - 將 Fan 正極直接連到 Arduino 5V
   - 將 Fan 負極直接連到 GND
   - 觀察 Fan 是否轉動

**判斷**:
- ✅ 如果負載正常工作 → 負載本身沒問題
- ❌ 如果負載無反應 → 負載損壞或電壓不足

---

### 測量結果紀錄表

| 測試項目 | 預期值 | 實際測量值 | 狀態 |
|---------|--------|-----------|------|
| Arduino Pin 6 (HIGH) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| Arduino Pin 6 (LOW) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| Arduino Pin 7 (HIGH) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| Arduino Pin 7 (LOW) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #1 Gate (HIGH) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #1 Gate (LOW) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #2 Gate (HIGH) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #2 Gate (LOW) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #1 Drain (Gate=HIGH) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #1 Drain (Gate=LOW) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #2 Drain (Gate=HIGH) | ~0V | ______ V | ☐ 正常 ☐ 異常 |
| MOSFET #2 Drain (Gate=LOW) | ~5V | ______ V | ☐ 正常 ☐ 異常 |
| UV LED 直接供電測試 | 點亮 | ☐ 亮 ☐ 不亮 | ☐ 正常 ☐ 異常 |
| Fan 直接供電測試 | 轉動 | ☐ 轉 ☐ 不轉 | ☐ 正常 ☐ 異常 |

---

## 🔧 故障排除流程

### 流程圖

```
開始
  ↓
上傳測試程式 (uv_fan_pin_test.ino)
  ↓
觀察序列埠日誌
  ↓
日誌顯示 HIGH → 實際 ON？
  ├─ YES → ✅ 軟硬體都正常！問題可能在主韌體的其他邏輯
  └─ NO → 繼續診斷
      ↓
測量 Arduino Pin 6/7 電壓
  ↓
Pin 電壓正確？
  ├─ NO → ❌ Arduino Pin 故障
  │        → 嘗試使用其他 Pin（需修改韌體）
  └─ YES → 繼續
      ↓
測量 MOSFET Gate 電壓
  ↓
Gate 電壓正確？
  ├─ NO → ❌ 220Ω 電阻斷路或 Gate 未連接
  │        → 檢查接線和電阻
  └─ YES → 繼續
      ↓
測量 MOSFET Drain 電壓
  ↓
Drain 電壓符合預期？
  ├─ NO → ❌ MOSFET 接法錯誤或損壞
  │        → 檢查 Source/Drain，更換 MOSFET
  └─ YES → 繼續
      ↓
實際負載行為與 Drain 電壓一致？
  ├─ YES → ✅ 硬體正常，問題在主韌體邏輯
  └─ NO → ❌ 負載接法錯誤或損壞
           → 直接供電測試負載
```

---

## 🐛 常見問題與解決方案

### 問題 1：日誌顯示正確，但實際硬體行為相反

**症狀**:
- 序列埠顯示 `Pin 6 -> HIGH`
- 萬用表測量 Pin 6 = 5V
- MOSFET Gate = 5V
- **但 UV LED 關閉**

**可能原因**:
1. **MOSFET Source 和 Drain 接反**
2. **使用了 P-channel MOSFET**（極性相反）
3. **負載接反**（例如 LED 正負極接反）

**解決方案**:
1. 檢查 MOSFET datasheet，確認哪支腳位是 Source，哪支是 Drain
2. 確認使用的是 N-channel MOSFET（型號通常包含 "N" 或 "FET"）
3. 嘗試將 MOSFET 轉 180 度（如果之前接反了）
4. 如果確定是 P-channel，需要修改韌體極性設定（將 `UV_LAMP_ACTIVE_HIGH` 改為 `0`）

---

### 問題 2：無論如何切換，負載狀態不變

**症狀**:
- 序列埠日誌正常切換 HIGH/LOW
- 但 UV LED 永遠亮著（或永遠暗著）
- Fan 永遠轉動（或永遠停止）

**可能原因**:
1. **MOSFET Gate 未連接**到正確的 Pin
2. **220Ω 電阻斷路**
3. **MOSFET 損壞**（永久導通或截止）
4. **負載直接接到電源**（繞過了 MOSFET）

**解決方案**:
1. 用萬用表測量 MOSFET Gate 電壓，確認有變化
2. 檢查 220Ω 電阻是否完好
3. 更換一顆新的 MOSFET
4. 追蹤負載的接線，確保經過 MOSFET Drain

---

### 問題 3：Pin Readback 值與寫入值不符

**症狀**:
- 序列埠顯示 `Pin write: Pin 6 -> HIGH`
- 但緊接著顯示 `Pin readback: Pin 6 reads LOW`

**可能原因**:
1. **Pin 被其他裝置拉低**（例如短路到 GND）
2. **Arduino Pin 損壞**
3. **MOSFET Gate 過度吸收電流**（不太可能，因為有 220Ω 限流電阻）

**解決方案**:
1. 斷開所有連接，單獨測試 Pin 6 和 Pin 7
2. 如果單獨測試正常，逐一重新連接元件，找出衝突源
3. 如果單獨測試仍異常，更換 Arduino 或使用其他 Pin

---

### 問題 4：主韌體正常，但測試程式失敗

**症狀**:
- 上傳主韌體 (`smart_cat_serial_bridge.ino`) 時一切正常
- 上傳測試程式 (`uv_fan_pin_test.ino`) 時硬體不工作

**可能原因**:
- 測試程式的 Pin 定義錯誤（不太可能，因為已確認是 Pin 6/7）
- 某些初始化步驟缺失

**解決方案**:
- 對照兩個程式的 `setup()` 函數，確認沒有遺漏的初始化

---

### 問題 5：一切測試正常，但 Web 控制仍失效

**症狀**:
- 測試程式工作正常
- 主韌體的除錯日誌顯示正確
- 但透過 Web 點擊按鈕沒反應

**可能原因**:
1. **Wi-Fi 命令未送達** Arduino
2. **後端 API 問題**
3. **前端 UI 未正確呼叫 API**
4. **硬體命令佇列阻塞**

**解決方案**:
1. 檢查後端日誌，確認收到前端的控制請求
2. 檢查後端資料庫 `hardware_commands` 表，查看命令狀態
3. 測試直接呼叫 API（用 `curl` 或 Postman）:
   ```bash
   curl -X POST http://localhost:4000/api/uv-fan/state \
     -H "Content-Type: application/json" \
     -H "x-smartcat-admin: Bearer YOUR_ADMIN_KEY" \
     -d '{"uvOn": true}'
   ```
4. 觀察 Arduino 序列埠是否收到命令

---

## 📞 下一步行動

### 立即執行
1. ✅ **上傳測試程式** (`uv_fan_pin_test.ino`)
2. ✅ **觀察序列埠日誌和實際硬體行為**
3. ✅ **使用萬用表測量** 關鍵點電壓
4. ✅ **填寫測量結果紀錄表**

### 根據結果採取行動

#### 如果測試程式一切正常
→ 問題在主韌體的複雜邏輯中
→ 上傳**除錯版主韌體**並分析 `[UV_DEBUG]` 日誌

#### 如果發現硬體問題
→ 根據測量結果修正接線
→ 更換損壞的元件
→ 重新測試

#### 如果仍無法解決
→ 提供完整的測量數據
→ 拍攝接線照片
→ 提供完整的序列埠日誌
→ 我們將進一步分析

---

## 📸 建議拍照記錄

為了更好地診斷，建議拍攝以下照片：

1. **完整電路俯視圖**（清楚顯示所有連接）
2. **MOSFET #1 特寫**（顯示 Gate, Drain, Source 連接）
3. **MOSFET #2 特寫**
4. **Arduino Pin 6 和 Pin 7 的接線**
5. **220Ω 和 10kΩ 電阻位置**
6. **UV LED 和 Fan 的接線**
7. **序列埠監視器的完整日誌截圖**
8. **萬用表測量畫面**（測量關鍵點時）

---

## 🎯 總結

這份指南提供了**系統化的診斷流程**，從軟體測試到硬體測量，逐步縮小問題範圍。

**關鍵診斷工具**:
- ✅ 除錯版主韌體（監控實際執行邏輯）
- ✅ 獨立測試程式（排除複雜邏輯）
- ✅ 萬用表測量（驗證硬體訊號）

**最可能的問題**:
1. MOSFET Source/Drain 接反
2. Gate 未連接到正確的 Pin
3. 接線鬆脫或接觸不良
4. MOSFET 型號或方向錯誤

按照這份指南逐步排查，一定能找到問題根源！

**祝診斷順利！** 🚀

---

**文檔版本**: 1.0
**最後更新**: 2025-11-14
**作者**: Claude Code
**專案**: Smart Cat Home - EE3070
