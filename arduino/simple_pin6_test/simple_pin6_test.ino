/*
 * 簡單的 Pin 6 測試程式
 * Simple Pin 6 Test - 每秒切換一次
 *
 * 用途：驗證 Pin 6 是否真的能控制 UV 燈
 * Purpose: Verify if Pin 6 can actually control the UV lamp
 */

const uint8_t TEST_PIN = 6;

void setup() {
  Serial.begin(115200);
  pinMode(TEST_PIN, OUTPUT);

  Serial.println(F("========================================"));
  Serial.println(F("Pin 6 Simple Toggle Test"));
  Serial.println(F("每秒切換一次 HIGH/LOW"));
  Serial.println(F("========================================"));
  Serial.println();
}

void loop() {
  // 輸出 HIGH
  digitalWrite(TEST_PIN, HIGH);
  Serial.println(F("Pin 6 = HIGH (應該：UV 燈滅)"));
  delay(1000);

  // 輸出 LOW
  digitalWrite(TEST_PIN, LOW);
  Serial.println(F("Pin 6 = LOW (應該：UV 燈亮)"));
  delay(1000);
}

/*
 * 測試方法：
 * 1. 上傳此程式到 Arduino
 * 2. 觀察 UV 燈是否每秒閃爍一次
 *
 * 預期結果：
 * - 如果 UV 燈每秒閃爍 → Pin 6 控制正常，問題在主程式
 * - 如果 UV 燈永遠亮著 → Pin 6 無法控制 UV 燈（硬體問題）
 * - 如果 UV 燈永遠滅著 → UV 燈或電源有問題
 */
