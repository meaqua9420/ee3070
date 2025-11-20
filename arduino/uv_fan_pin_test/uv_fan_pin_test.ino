/*
 * UV 燈和風扇 Pin 測試程式
 * Simple Pin Test for UV Lamp and Fan
 *
 * 用途：獨立測試 Pin 6 (UV) 和 Pin 7 (Fan) 的輸出
 * Purpose: Standalone test for Pin 6 (UV) and Pin 7 (Fan) outputs
 *
 * 硬體連接：
 * - Pin 6 → MOSFET #1 Gate (UV LED)
 * - Pin 7 → MOSFET #2 Gate (Fan)
 *
 * 預期行為 (N-channel MOSFET 低側開關)：
 * - Pin 輸出 HIGH (5V) → MOSFET 導通 → LED/Fan 開啟
 * - Pin 輸出 LOW (0V) → MOSFET 截止 → LED/Fan 關閉
 *
 * 測試流程：
 * 1. 每 2 秒切換一次狀態
 * 2. 輸出詳細日誌到序列埠
 * 3. 觀察實際 LED/Fan 是否與日誌一致
 */

// Pin 定義
const uint8_t UV_LAMP_PIN = 6;
const uint8_t UV_FAN_PIN = 7;

// 狀態變數
bool currentState = false;  // false = 關閉, true = 開啟
unsigned long lastToggleTime = 0;
const unsigned long TOGGLE_INTERVAL = 2000;  // 2 秒

void setup() {
  // 初始化序列埠
  Serial.begin(115200);
  while (!Serial) {
    ; // 等待序列埠連接
  }

  Serial.println(F("========================================"));
  Serial.println(F("UV Lamp & Fan Pin Test"));
  Serial.println(F("========================================"));
  Serial.println();

  // 設定 Pin 模式
  pinMode(UV_LAMP_PIN, OUTPUT);
  pinMode(UV_FAN_PIN, OUTPUT);

  Serial.print(F("UV_LAMP_PIN = "));
  Serial.println(UV_LAMP_PIN);
  Serial.print(F("UV_FAN_PIN = "));
  Serial.println(UV_FAN_PIN);
  Serial.println();

  // 初始狀態：關閉（LOW）
  digitalWrite(UV_LAMP_PIN, LOW);
  digitalWrite(UV_FAN_PIN, LOW);

  Serial.println(F("Initial state: Both pins set to LOW"));
  Serial.println(F("Expected: UV LED OFF, Fan OFF"));
  Serial.println();
  Serial.println(F("Test will toggle every 2 seconds..."));
  Serial.println(F("========================================"));
  Serial.println();

  lastToggleTime = millis();
}

void loop() {
  unsigned long currentTime = millis();

  // 每 2 秒切換一次狀態
  if (currentTime - lastToggleTime >= TOGGLE_INTERVAL) {
    lastToggleTime = currentTime;
    currentState = !currentState;  // 切換狀態

    // 設定 Pin 輸出
    digitalWrite(UV_LAMP_PIN, currentState ? HIGH : LOW);
    digitalWrite(UV_FAN_PIN, currentState ? HIGH : LOW);

    // 輸出詳細日誌
    Serial.println(F("----------------------------------------"));
    Serial.print(F("Time: "));
    Serial.print(currentTime / 1000);
    Serial.println(F(" seconds"));
    Serial.println();

    Serial.print(F("Target State: "));
    Serial.println(currentState ? F("ON (開啟)") : F("OFF (關閉)"));
    Serial.println();

    Serial.print(F("Pin "));
    Serial.print(UV_LAMP_PIN);
    Serial.print(F(" (UV) output: "));
    Serial.println(currentState ? F("HIGH (5V)") : F("LOW (0V)"));

    Serial.print(F("Pin "));
    Serial.print(UV_FAN_PIN);
    Serial.print(F(" (Fan) output: "));
    Serial.println(currentState ? F("HIGH (5V)") : F("LOW (0V)"));
    Serial.println();

    // 回讀驗證
    bool uvReadback = digitalRead(UV_LAMP_PIN);
    bool fanReadback = digitalRead(UV_FAN_PIN);

    Serial.print(F("Pin "));
    Serial.print(UV_LAMP_PIN);
    Serial.print(F(" readback: "));
    Serial.println(uvReadback ? F("HIGH") : F("LOW"));

    Serial.print(F("Pin "));
    Serial.print(UV_FAN_PIN);
    Serial.print(F(" readback: "));
    Serial.println(fanReadback ? F("HIGH") : F("LOW"));
    Serial.println();

    // 預期硬體行為（假設是 N-channel MOSFET）
    Serial.println(F("Expected hardware behavior:"));
    if (currentState) {
      Serial.println(F("  - UV LED should be ON (亮起)"));
      Serial.println(F("  - Fan should be SPINNING (運轉)"));
    } else {
      Serial.println(F("  - UV LED should be OFF (熄滅)"));
      Serial.println(F("  - Fan should be STOPPED (停止)"));
    }
    Serial.println();

    Serial.println(F("Please verify the actual hardware behavior!"));
    Serial.println(F("請檢查實際硬體行為是否符合預期！"));
    Serial.println(F("----------------------------------------"));
    Serial.println();
  }
}

/*
 * 使用說明 / Instructions:
 *
 * 1. 上傳此程式到 Arduino Mega 2560
 * 2. 打開序列埠監視器（115200 baud）
 * 3. 觀察日誌輸出並對照實際硬體行為
 *
 * 診斷方法 / Diagnosis:
 *
 * 情況 A：日誌顯示 HIGH，實際 LED/Fan 開啟 → ✅ 正常
 * 情況 B：日誌顯示 LOW，實際 LED/Fan 關閉 → ✅ 正常
 * 情況 C：日誌顯示 HIGH，實際 LED/Fan 關閉 → ❌ 硬體問題
 *   - 檢查 MOSFET 接線
 *   - 檢查 Gate 是否連接到正確的 Pin
 *   - 檢查 Source/Drain 是否接反
 *   - 檢查 MOSFET 是否損壞
 *
 * 情況 D：日誌顯示 LOW，實際 LED/Fan 開啟 → ❌ 極性相反
 *   - 可能使用 P-channel MOSFET（極性相反）
 *   - 可能有反相電路
 *   - 需要修改韌體極性設定
 *
 * 情況 E：無論日誌如何，LED/Fan 狀態不變 → ❌ 連接問題
 *   - MOSFET Gate 可能未連接到 Pin
 *   - 檢查麵包板或跳線
 *   - 檢查 220Ω 電阻
 *
 * 情況 F：Readback 值與 Output 不符 → ❌ Pin 衝突或故障
 *   - Pin 可能被其他裝置佔用
 *   - Arduino Pin 可能損壞
 */
