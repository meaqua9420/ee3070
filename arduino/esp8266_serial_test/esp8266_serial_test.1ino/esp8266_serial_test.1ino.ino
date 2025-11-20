#include <Arduino.h>

// 測試橋接：USB 序列 <-> ESP8266（Serial1）
// 預設 PC 端 115200 bps，ESP8266 端 9600 bps，可透過輸入指令切換。

constexpr unsigned long PC_BAUD = 115200;
unsigned long espBaud = 9600;

void beginEspSerial(unsigned long baud) {
  Serial1.end();
  delay(50);
  Serial1.begin(baud);
  delay(100);
  Serial.print(F("[info] Serial1 @ "));
  Serial.println(baud);
}

void setup() {
  Serial.begin(PC_BAUD);
  while (!Serial) {
    ;  // 等待 USB 序列就緒（Leonardo/Micro 等板子需要）
  }

  Serial.println(F("=== ESP8266 Serial Bridge ==="));
  Serial.println(F("Commands:"));
  Serial.println(F("  AT..... : 直接輸入 AT 指令後按 Enter"));
  Serial.println(F("  BAUD=xxx: 例如 BAUD=115200，可切換 Serial1 鮑率"));
  Serial.println();

  beginEspSerial(espBaud);
}

void loop() {
  // 將 USB 序列輸入轉送給 ESP8266
  if (Serial.available()) {
    char c = static_cast<char>(Serial.read());

    // 簡易指令：偵測 BAUD= 指令切換鮑率
    static String cmdBuffer;
    if (c == '\n' || c == '\r') {
      if (cmdBuffer.startsWith("BAUD=")) {
        unsigned long newBaud = cmdBuffer.substring(5).toInt();
        if (newBaud > 0) {
          espBaud = newBaud;
          beginEspSerial(espBaud);
        } else {
          Serial.println(F("[warn] 無效的鮑率值"));
        }
      } else if (cmdBuffer.length() > 0) {
        Serial1.print(cmdBuffer);
        Serial1.print("\r\n");
      }
      cmdBuffer = "";
    } else {
      cmdBuffer += c;
    }
  }

  // 將 ESP8266 回應轉回 USB 序列顯示
  while (Serial1.available()) {
    Serial.write(Serial1.read());
  }
}

