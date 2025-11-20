## DHT11 接腳快速提示

- **Mega 預設**：資料腳接 D24（`DHT_PIN = 24`；HX711 啟用，但忙碌時會改用 fallback 開閘）。
- **UNO/Nano**：可改接 D4，並在 `smart_cat_serial_bridge.ino` 把 `DHT_PIN` 改為 `4`。
- 佈線：VCC → 5V、GND → 共地、DATA → 你設定的腳位（如模組未內建上拉，請加 10k 上拉）。

## ST021（SHT21 相容）提醒

- 需要 **4-pin I²C** 版本（VCC/GND/SDA/SCL）；Mega 請接 D20/D21，UNO 則接 A4/A5。
- 若手上只有 3-pin 「IN/VCC/GND」類比板，無法直接用現有 I²C 驅動；可改接到類比腳自行讀值，或改回 DHT11。
- 韌體 `ENABLE_ST021` 開為 `1` 才會嘗試覆寫溫濕度，偵測不到則自動回退 DHT11。
