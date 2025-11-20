#define ENABLE_DS3231 0// 使用 DS3231 提供餵食與補水排程
#define ENABLE_ST021 0   // ST021 作為進階選配；預設仍以 DHT11 為主
#define ENABLE_ESP8266 1
#define ENABLE_OLED 0
#define ENABLE_AUDIO 1 // 8002 音訊功放（Shutdown引脚连接到Pin 10）
#define ENABLE_UV_FAN 1  // UV 殺菌燈 + 抽風機
#if ENABLE_UV_FAN
#ifndef UV_LAMP_ACTIVE_HIGH
// 🔧 修復：實際硬體是低電位導通（Pin LOW = 燈亮）
// Fixed: Actual hardware is active-low (Pin LOW = LED ON)
#define UV_LAMP_ACTIVE_HIGH 1  // 改為 0 = 低電位導通
#endif
#ifndef UV_FAN_ACTIVE_HIGH
// 假設風扇也是相同的極性
// Assuming fan has the same polarity
#define UV_FAN_ACTIVE_HIGH 1   // 改為 0 = 低電位導通
#endif
#endif
#define ENABLE_HX711 1  // 啟用秤重；若秤重未連接，程式會自動略過忙碌檢查避免餵食被阻擋

#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#include <ctype.h>

#include "audio_types.h"

#if ENABLE_HX711
#include <Servo.h>
#include "HX711.h"
#endif

#if ENABLE_AUDIO
#include <avr/pgmspace.h>
#endif

void printEscapedJson(const char* str);

// 🔒 安全配置：凭证存储在独立文件中 / Security: credentials stored in separate file
// 如果 credentials.h 不存在，请复制 credentials.h.example 并重命名
// If credentials.h doesn't exist, copy credentials.h.example and rename it
#include "credentials.h"

// 固件版本 / Firmware version
#define FIRMWARE_VERSION "1.1.3-upload"

// 宏字符串化辅助 / Macro stringification helper
#define STRINGIFY(x) #x
#define TOSTRING(x) STRINGIFY(x)

#if ENABLE_ESP8266
#include <WiFiEsp.h>
#define ESP_BAUDRATE 115200
#endif

#if ENABLE_DS3231
#include <RTClib.h>
#endif

#if ENABLE_OLED
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;
Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire);
bool oledReady = false;
#endif

#if ENABLE_ESP8266
#if !defined(ESP8266_USE_HARDWARE_SERIAL)
#if defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_MEGA) || defined(ARDUINO_AVR_MEGA1280)
#define ESP8266_USE_HARDWARE_SERIAL 1
#else
#define ESP8266_USE_HARDWARE_SERIAL 0
#endif
#endif
#if ESP8266_USE_HARDWARE_SERIAL
#ifndef ESP8266_STREAM
#define ESP8266_STREAM Serial1  // Mega2560: RX1 (pin 19), TX1 (pin 18)
#endif
#else
#include <SoftwareSerial.h>
#endif
#endif

// =======================
// Pin Definitions
// =======================
const uint8_t trigPin = 13;  // HC-SR04 Trigger
const uint8_t echoPin = 2;   // HC-SR04 Echo

// ── 主要接腳對照表（以 Mega2560 佈線為例）───────────────────────────
//  D3  → BTN_FEED（手動餵食按鈕，LOW 觸發）
//  D4  → HX711 SCK（食盆秤時鐘）
//  D5  → HX711 DT（食盆秤資料）
//  D6  → UV 殺菌燈
//  D7  → 抽風風扇
//  D8  → BTN_RESET（餵食／補水緊急停止）
//  D9  → FEEDER_SERVO（PWM，控制餵食閘門）
//  D10 → BTN_CAL（Smart Pet Feeder 校正按鈕）
//  D11 → BTN_TARE（Smart Pet Feeder 去皮按鈕）
//  D12 → 可留作其它控制（預設未使用）
//  D52 → 8002 音訊輸出（僅需一條信號線）
//  D13 → HC-SR04 Trigger（距離感測）
//  A0  → LM35（目前保留）
//  A1  → LDR（環境光）
//  A2/A3 → 軟序列（預設給 ESP8266 RX/TX）
//  A4/A5 → I2C（RTC、OLED、ST021）
//  D22 → UV/抽風等繼電器輸出位
//  D23 → WATER_PUMP（Relay 控制水泵）
//  D24 → DHT11 資料腳（Mega 預設）；若要接 D4，請下方改成 DHT_PIN = 4 並把跳線接 D4
//  D25 → BTN_WATER（手動補水按鈕）
//
// 🔊 音频模块：8002单声道功放
//    - D52 连接到 8002 的 IN+ (音频输入)
//    - 若未使用 SD/EN，可将该脚常拉高或直接接电源使其常开
//    - 8002 的 IN- 接地，OUT+/OUT- 连接喇叭
//
// 若改用 UNO，請重新配置 UV、補水與餵食腳位；Mega2560 則可直接依上表佈線。
// ────────────────────────────────────────────────

// Analog sensors
const uint8_t lm35Pin = A0;  // LM35 (unused but kept for reference)
const uint8_t ldrPin  = A1;  // LDR

#if ENABLE_HX711
const uint8_t HX711_DT_PIN = 5;
const uint8_t HX711_SCK_PIN = 4;  // 對應 Smart Pet Feeder 配線
HX711 foodScaleSensor;
#endif

// 餵食器控制 / Feeder Control
const uint8_t FEEDER_SERVO_PIN = 9;
const uint8_t BTN_TARE_PIN = 11;     // Smart Pet Feeder 去皮按鈕
const uint8_t BTN_RESET_PIN = 8;     // 重置按鈕
const uint8_t BTN_CAL_PIN = 10;      // Smart Pet Feeder 校正按鈕
const uint8_t BTN_FEED_PIN = 3;      // 手動餵食按鈕

// 水合系統控制 / Hydration System Control
#define ENABLE_HYDRATION 1
#if ENABLE_HYDRATION
constexpr uint8_t WATER_PUMP_PIN = 23;      // 繼電器控制水泵
constexpr uint8_t WATER_SENSOR_PIN = A5;    // 模擬水位傳感器
constexpr uint8_t BTN_WATER_PIN = 25;       // 手動補水按鈕
constexpr int WATER_THRESHOLD = 400;        // 水位閾值
#endif

// DHT11 sensor (fallback if ST021 is unavailable)
// Mega 預設使用 D24；若採 UNO 佈線可改 4。
constexpr uint8_t DHT_PIN = 24;
#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

// =======================
// HC-SR04 Interrupt State
// =======================
volatile unsigned long pulseStartMicros = 0;
volatile unsigned long pulseEndMicros = 0;
volatile bool pulseReady = false;

// =======================
// Calibration Defaults
// =======================
constexpr float ADC_REF_VOLT = 5.0f;
long foodZeroRaw = 0L;
float foodScale = 1.0f;  // raw units -> grams
float lastFoodWeightGrams = 0.0f;
long lastFoodRaw = 0L;
constexpr float FOOD_REFERENCE_WEIGHT_GRAMS = 200.0f;  // default calibration weight
float foodReferenceWeightGrams = FOOD_REFERENCE_WEIGHT_GRAMS;

struct FeederScheduleSlot {
  uint8_t hour;
  uint8_t minute;
  bool completed;
};

struct SmartFeederState {
  bool feedingActive;
  bool calibrationMode;
  bool manualButtonLatched;
  float targetWeightGrams;
  float minWeightGrams;
  unsigned long feedingStartedMs;
  uint32_t feedingStartedUnix;
};

constexpr float FEEDER_TARGET_WEIGHT_DEFAULT = 50.0f;
constexpr float FEEDER_MIN_WEIGHT_DEFAULT = 30.0f;
constexpr unsigned long SMART_FEED_MAX_DURATION_MS = 20000UL;
constexpr unsigned long SMART_FEED_SAMPLE_DELAY_MS = 200UL;
constexpr uint8_t MAX_FEEDER_SCHEDULE_SLOTS = 6;
constexpr size_t FEEDER_SCHEDULE_BUFFER_SIZE = 64;
const char DEFAULT_FEEDER_SCHEDULE[] = "08:00,18:00";

SmartFeederState feederState = {
  false,
  false,
  false,
  FEEDER_TARGET_WEIGHT_DEFAULT,
  FEEDER_MIN_WEIGHT_DEFAULT,
  0UL,
  0U,
};

FeederScheduleSlot feederScheduleSlots[MAX_FEEDER_SCHEDULE_SLOTS];
uint8_t feederScheduleSlotCount = 0;
char feederScheduleBuffer[FEEDER_SCHEDULE_BUFFER_SIZE] = "08:00,18:00";

// Water level calibration (cm from sensor to water surface)
float waterLevelFullCm  = 4.0f;
float waterLevelEmptyCm = 18.0f;

// LDR calibration (ADC)
int ldrDarkRef   = 900;
int ldrBrightRef = 150;

// Bowl & cat thresholds
float waterBowlCapacityMl     = 320.0f;
float catPresenceThresholdKg  = 1.2f;

// 🔒 传感器失败防抖机制 / Sensor failure debouncing mechanism
uint8_t distanceSensorFailCount = 0;
constexpr uint8_t DISTANCE_SENSOR_MAX_FAILS = 5;  // 连续失败 5 次后才使用缓存值 / Use cached value after 5 consecutive failures
float lastValidDistanceCm = 10.0f;  // 上次有效读数 / Last valid reading

// Derived tracking
float lastWaterLevelPercent   = 100.0f;
float cumulativeWaterIntakeMl = 0.0f;
unsigned long lastFeedingMillis = 0;

#if ENABLE_UV_FAN
// UV 燈與抽風機腳位（依照使用者實際佈線：燈＝D6、風扇＝D7）
constexpr uint8_t UV_LAMP_PIN = 6;
constexpr uint8_t UV_FAN_PIN = 7;
constexpr unsigned long UV_CLEAN_INTERVAL_MS = 30UL * 60UL * 1000UL;   // 30 minutes
constexpr unsigned long UV_CLEAN_DURATION_MS = 15UL * 1000UL;          // 15 seconds default

struct UvFanRuntimeState {
  bool uvOn;
  bool fanOn;
  bool autoMode;
  bool cleaningActive;
  unsigned long cleaningStartedMs;
  unsigned long cleaningDurationMs;
  unsigned long lastRunMillis;
  uint32_t lastRunUnix;
  uint32_t nextAutoUnix;
  unsigned long nextAutoMillis;
};

UvFanRuntimeState uvFanState = {
  false,
  false,
  true,
  false,
  0UL,
  UV_CLEAN_DURATION_MS,
  0UL,
  0UL,
  0UL,
  0UL,
};

void uvFanApplyOutputs(bool uvOn, bool fanOn);
void uvFanScheduleNext(unsigned long nowMs, uint32_t nowUnix);
void uvFanRecordRun(unsigned long nowMs, uint32_t nowUnix);
void uvFanStartCleaning(unsigned long durationMs, unsigned long nowMs, uint32_t nowUnix);
void uvFanStopCleaning(bool recordRun, unsigned long nowMs, uint32_t nowUnix);
void uvFanSetAutoMode(bool enabled, unsigned long nowMs, uint32_t nowUnix);
void uvFanApplyManualState(bool uvOn, bool fanOn, unsigned long nowMs, uint32_t nowUnix);
void uvFanUpdate(unsigned long nowMs, uint32_t nowUnix);
#endif

// =======================
// Hydration System
// =======================
#if ENABLE_HYDRATION
struct HydrationState {
  int waterLevel;             // 當前水位讀數
  bool pumpActive;            // 水泵是否運行
  unsigned long lastRefillMs; // 上次補水時間（毫秒）
  uint32_t lastRefillUnix;    // 上次補水時間（Unix）
  bool hasPumpedMorning;      // 今日是否已補水（8:00）
  bool hasPumpedNoon;         // 今日是否已補水（12:00）
  bool hasPumpedAfternoon;    // 今日是否已補水（16:00）
  bool hasPumpedEvening;      // 今日是否已補水（20:00）
  bool manualButtonPressed;   // 手動按鈕是否按下
  bool manualOverrideActive;  // 手動模式中是否保持水泵開啟
  bool hasResetToday;         // 午夜是否已重置旗標
  unsigned long startupMs;    // 電源啟動時間戳
};

HydrationState hydrationState = {
  0,      // waterLevel
  false,  // pumpActive
  0UL,    // lastRefillMs
  0,      // lastRefillUnix
  false,  // hasPumpedMorning
  false,  // hasPumpedNoon
  false,  // hasPumpedAfternoon
  false,  // hasPumpedEvening
  false,  // manualButtonPressed
  false,  // manualOverrideActive
  false,  // hasResetToday
  0UL     // startupMs
};

// 函數聲明 moved to forward declaration section
#endif

// =======================
// DS3231 RTC
// =======================
#if ENABLE_DS3231
RTC_DS3231 rtc;
bool rtcReady = false;
uint32_t lastFeedingUnix = 0;
#endif

#if ENABLE_HX711
// =======================
// Feeder Servo & Buttons
// =======================
Servo feederServo;
bool feederServoAttached = false;
bool feederGateOpen = false;
unsigned long feederCloseAtMs = 0;
constexpr int FEEDER_SERVO_CLOSED_ANGLE = 0;
constexpr int FEEDER_SERVO_OPEN_ANGLE = 180;  // Changed from 75° to 180°
constexpr unsigned long FEEDER_OPEN_DURATION_MS = 2500;
unsigned long feederOpenDurationMs = FEEDER_OPEN_DURATION_MS;

constexpr unsigned long BUTTON_DEBOUNCE_MS = 250;
int tareButtonPrev = HIGH;
int resetButtonPrev = HIGH;
int calButtonPrev = HIGH;
int feedButtonPrev = HIGH;
unsigned long tareButtonLastMs = 0;
unsigned long resetButtonLastMs = 0;
unsigned long calButtonLastMs = 0;
unsigned long feedButtonLastMs = 0;
#endif

// =======================
// ST021 (SHT21-compatible) sensor
// =======================
#if ENABLE_ST021
constexpr uint8_t ST021_ADDRESS = 0x40;
constexpr uint8_t ST021_CMD_TEMPERATURE = 0xF3;
constexpr uint8_t ST021_CMD_HUMIDITY = 0xF5;
bool st021Ready = false;

// 🔒 CRC-8 校验函数（SHT21 标准多项式 0x131）
// CRC-8 checksum function (SHT21 standard polynomial 0x131)
uint8_t st021ComputeCRC(const uint8_t* data, size_t length) {
  constexpr uint8_t POLYNOMIAL = 0x31;  // x^8 + x^5 + x^4 + 1 的低 8 位 / Lower 8 bits of x^8 + x^5 + x^4 + 1
  uint8_t crc = 0x00;  // 初始值 / Initial value

  for (size_t i = 0; i < length; i++) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = (crc << 1) ^ POLYNOMIAL;
      } else {
        crc <<= 1;
      }
    }
  }
  return crc;
}
#endif

// =======================
// ESP8266 WiFi (AT firmware)
// =======================
#if ENABLE_ESP8266
#if !ESP8266_USE_HARDWARE_SERIAL
const uint8_t ESP8266_RX_PIN = A2;     // 軟序列 RX（改用 A2/A3，避免占用餵食按鈕腳位）
const uint8_t ESP8266_TX_PIN = A3;     // 軟序列 TX
#endif
const unsigned long ESP8266_BAUD_PRIMARY = 115200;
const unsigned long ESP8266_BAUD_FALLBACK = 9600;
unsigned long esp8266CurrentBaud = 0;

// 🔒 WiFi 和后端配置从 credentials.h 读取 / WiFi and backend config from credentials.h
const char WIFI_SSID[] = WIFI_SSID_STR;
const char WIFI_PASSWORD[] = WIFI_PASSWORD_STR;
const char BACKEND_HOST[] = BACKEND_HOST_STR;
const uint16_t BACKEND_PORT = BACKEND_PORT_NUM;
const char BACKEND_PATH[] = BACKEND_PATH_STR;
const char HARDWARE_COMMAND_PENDING_PATH[] = "/api/hardware/commands/pending";
#ifdef BACKEND_API_KEY_STR
const char BACKEND_API_KEY[] = BACKEND_API_KEY_STR;
#else
const char BACKEND_API_KEY[] = "";  // 可选 / Optional
#endif

#if ESP8266_USE_HARDWARE_SERIAL
HardwareSerial& esp8266 = ESP8266_STREAM;
#else
SoftwareSerial esp8266(ESP8266_RX_PIN, ESP8266_TX_PIN);
#endif
bool esp8266Ready = false;
bool wifiConnected = false;
unsigned long lastWifiAttempt = 0;
#endif

#if ENABLE_ESP8266
bool esp8266WaitFor(const char* token, const char* altToken, unsigned long timeoutMs);
bool esp8266SendCommand(const String& command, const char* token, const char* altToken, unsigned long timeoutMs, bool flushBeforeSend = true);
void esp8266SwitchBaud(unsigned long baud);
bool esp8266BeginAndPing(unsigned long baud);
bool esp8266InitModule();
const char* esp8266DescribeCwJapError(int code);
bool esp8266HttpRequest(const char* method, const String& path, const String& body, const char* contentType, int& statusCode, String& responseBody, String* rawResponseOut = nullptr);
bool esp8266PostJson(const String& payload, String* responseOut = nullptr);
bool sendHardwareCommandAck(int commandId, bool success, const String& message);
bool processHardwareCommandEnvelope(JsonObject data);
void processInlineHardwareCommands(const String& responseBody);
void enqueueHardwareCommandResult(int commandId, bool success, const String& message);
void pollHardwareCommands();
constexpr size_t ESP8266_HTTP_RESPONSE_MAX = 4096;
#endif

// =======================
// Runtime Configuration
// =======================
constexpr unsigned long REPORT_INTERVAL_MS = 5000;
unsigned long lastReportMillis = 0;

// 縮短輪詢間隔以提高 Web 控制的響應速度
// Reduce poll interval for faster web control response
constexpr unsigned long COMMAND_POLL_INTERVAL_MS = 1000;  // 1 秒（优化后，原本2秒）- 更快的音频响应
unsigned long lastCommandPollMillis = 0;

// 🔒 命令速率限制 / Command rate limiting
constexpr unsigned long COMMAND_COOLDOWN_MS = 500;  // 每个命令之间至少 500ms / At least 500ms between commands
unsigned long lastCommandMillis = 0;
uint8_t recentCommandCount = 0;
constexpr uint8_t MAX_COMMANDS_PER_MINUTE = 60;  // 每分钟最多 60 条命令 / Max 60 commands per minute
unsigned long commandCounterResetMillis = 0;

#if ENABLE_ESP8266
constexpr uint8_t MAX_PENDING_COMMAND_RESULTS = 8;
struct HardwareCommandResultEntry {
  int id;
  bool success;
  char message[48];
};
HardwareCommandResultEntry pendingHardwareCommandResults[MAX_PENDING_COMMAND_RESULTS];
uint8_t pendingHardwareCommandResultCount = 0;

void enqueueHardwareCommandResult(int commandId, bool success, const String& message);
void clearHardwareCommandResult(int commandId);
#endif

String serialBuffer;
constexpr size_t MAX_SERIAL_BUFFER_SIZE = 512;  // 🔒 最大緩衝區限制 / Max buffer size limit
unsigned long serialBufferLastCharMillis = 0;
constexpr unsigned long SERIAL_BUFFER_IDLE_FLUSH_MS = 2500;  // 無換行時的自動送出延遲 / Auto-flush delay when no newline
#define ENABLE_SERIAL_RX_DEBUG 0

#if ENABLE_SERIAL_RX_DEBUG
void serialDebugLogChar(char c) {
  Serial.print(F("{\"debug\":\"serialRx\",\"code\":"));
  Serial.print(static_cast<int>(static_cast<unsigned char>(c)));
  Serial.print(F(",\"char\":\""));
  if (isprint(static_cast<unsigned char>(c))) {
    if (c == '\"') {
      Serial.print(F("\\\""));
    } else if (c == '\\') {
      Serial.print(F("\\\\"));
    } else {
      Serial.print(c);
    }
  } else {
    Serial.print(F("\\x"));
    if (static_cast<unsigned char>(c) < 16) Serial.print('0');
    Serial.print(static_cast<unsigned char>(c), HEX);
  }
  Serial.println(F("\"}"));
}
#else
inline void serialDebugLogChar(char) {}
#endif

// =======================
// Forward declarations
// =======================
void markFeedingEvent();
void bootLog(const __FlashStringHelper* stage);
void bootLog(const char* stage);
bool probeI2cDevice(uint8_t address, uint16_t waitUs = 0);
String extractJsonPayload(const String& text);
String stripIpdPrefixes(const String& text);
String resolveHttpJsonBody(const String& preferred, const String& raw);
#if ENABLE_HX711
bool startSmartFeedingCycle(uint32_t nowUnix, const char* reason, float targetOverride = 0.0f, float minOverride = 0.0f);
void stopSmartFeedingCycle(const char* reason);
void runInteractiveFeederCalibration();
void applyFeederScheduleString(const char* schedule);
void resetFeederSchedule();
void processFeederScheduleTick(uint8_t hour, uint8_t minute, uint8_t second, uint32_t nowUnix);
#endif
#if ENABLE_HYDRATION
int readWaterLevel(int samples = 10);
void handleManualWaterButton(unsigned long nowMs, uint32_t nowUnix);
void processHydrationScheduleTick(uint8_t hour, uint8_t minute, uint32_t nowUnix);
void runHydrationBurst(const char* reason, uint32_t nowUnix, unsigned long durationMs = 1000UL);
void resetDailyHydrationFlags();
#endif

// =======================
// Utility Functions
// =======================
int sampleAnalogAvg(uint8_t pin, int samples = 10, int gapMs = 2) {
  long acc = 0;
  for (int i = 0; i < samples; i++) {
    acc += analogRead(pin);
    delay(gapMs);
  }
  return static_cast<int>(acc / samples);
}

float readDistanceCm() {
  pulseReady = false;
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long startWait = millis();
  while (!pulseReady && (millis() - startWait) < 60) {
    // wait for interrupt to fire
  }

  if (!pulseReady) {
    return -1.0f;
  }

  // 🔒 修复：原子性地复制 volatile 变量以防止竞态条件
  // Fix: Atomically copy volatile variables to prevent race condition
  noInterrupts();
  unsigned long start = pulseStartMicros;
  unsigned long end = pulseEndMicros;
  interrupts();

  unsigned long duration = end - start;
  return (duration * 0.0343f) / 2.0f;
}

float computeWaterLevelPercent(float distanceCm) {
  if (distanceCm <= 0.0f) return -1.0f;
  const float minCm = min(waterLevelFullCm, waterLevelEmptyCm);
  const float maxCm = max(waterLevelFullCm, waterLevelEmptyCm);

  // 🔒 修复：防止除以零
  // Fix: Prevent division by zero if full and empty levels are equal
  float range = maxCm - minCm;
  if (fabsf(range) < 0.01f) {
    return 50.0f;  // 如果范围太小，返回 50% / Return 50% if range is too small
  }

  float clamped = constrain(distanceCm, minCm, maxCm);
  float percent = 100.0f * (maxCm - clamped) / range;
  return constrain(percent, 0.0f, 100.0f);
}

float computeAmbientPercent(int ldrAdc) {
  int clamped = constrain(ldrAdc, min(ldrDarkRef, ldrBrightRef), max(ldrDarkRef, ldrBrightRef));
  float span = float(ldrDarkRef - ldrBrightRef);
  if (fabsf(span) < 1.0f) span = span >= 0 ? 1.0f : -1.0f;
  float percent = 100.0f * float(ldrDarkRef - clamped) / span;
  return constrain(percent, 0.0f, 100.0f);
}

#if ENABLE_HX711
void ensureServoAttached() {
  if (!feederServoAttached) {
    feederServo.attach(FEEDER_SERVO_PIN);
    feederServo.write(FEEDER_SERVO_CLOSED_ANGLE);
    feederServoAttached = true;
  }
}

float readFoodWeightGrams() {
  if (!foodScaleSensor.is_ready()) {
    return lastFoodWeightGrams;
  }
  const long raw = foodScaleSensor.read_average(10);
  lastFoodRaw = raw;
  const float grams = (raw - foodZeroRaw) * foodScale;
  lastFoodWeightGrams = grams < 0.0f ? 0.0f : grams;
  return lastFoodWeightGrams;
}

void tareFoodScale(uint8_t samples = 20) {
  if (!foodScaleSensor.is_ready()) {
    return;
  }
  foodZeroRaw = foodScaleSensor.read_average(samples);
  lastFoodWeightGrams = 0.0f;
  lastFoodRaw = foodZeroRaw;
}

bool calibrateFoodScale(float referenceGrams, uint8_t samples = 30) {
  if (!foodScaleSensor.is_ready()) {
    return false;
  }
  const long raw = foodScaleSensor.read_average(samples);
  const long delta = raw - static_cast<long>(foodZeroRaw);
  if (labs(delta) < 10L) {
    return false;
  }
  foodScale = referenceGrams / static_cast<float>(delta);
  float grams = (raw - foodZeroRaw) * foodScale;
  if (grams < 0.0f) grams = 0.0f;
  lastFoodWeightGrams = grams;
  return true;
}

void openFeederGate(unsigned long durationMs = 0) {
  ensureServoAttached();
  Serial.print(F("🔧 [DEBUG] Opening feeder gate to "));
  Serial.print(FEEDER_SERVO_OPEN_ANGLE);
  Serial.println(F("°"));

  // Slow movement to reduce current spike
  int currentAngle = feederServo.read();
  for (int angle = currentAngle; angle <= FEEDER_SERVO_OPEN_ANGLE; angle += 5) {
    feederServo.write(angle);
    delay(15);  // Slow down movement to reduce power draw
  }
  feederServo.write(FEEDER_SERVO_OPEN_ANGLE);

  feederGateOpen = true;
  const unsigned long effectiveDuration = durationMs > 0 ? durationMs : feederOpenDurationMs;
  feederCloseAtMs = millis() + effectiveDuration;
}

void closeFeederGate() {
  if (!feederGateOpen) return;
  ensureServoAttached();
  Serial.print(F("🔧 [DEBUG] Closing feeder gate to "));
  Serial.print(FEEDER_SERVO_CLOSED_ANGLE);
  Serial.println(F("°"));

  // Slow movement to reduce current spike
  int currentAngle = feederServo.read();
  for (int angle = currentAngle; angle >= FEEDER_SERVO_CLOSED_ANGLE; angle -= 5) {
    feederServo.write(angle);
    delay(15);  // Slow down movement to reduce power draw
  }
  feederServo.write(FEEDER_SERVO_CLOSED_ANGLE);

  feederGateOpen = false;
  feederCloseAtMs = 0;
}

void updateFeederGate() {
  if (feederGateOpen && millis() >= feederCloseAtMs) {
    closeFeederGate();
  }
}

void applyFeederScheduleString(const char* schedule) {
  if (!schedule || strlen(schedule) == 0) {
    strncpy(feederScheduleBuffer, DEFAULT_FEEDER_SCHEDULE, FEEDER_SCHEDULE_BUFFER_SIZE - 1);
    feederScheduleBuffer[FEEDER_SCHEDULE_BUFFER_SIZE - 1] = '\0';
  } else {
    strncpy(feederScheduleBuffer, schedule, FEEDER_SCHEDULE_BUFFER_SIZE - 1);
    feederScheduleBuffer[FEEDER_SCHEDULE_BUFFER_SIZE - 1] = '\0';
  }

  feederScheduleSlotCount = 0;
  char* cursor = feederScheduleBuffer;
  while (*cursor && feederScheduleSlotCount < MAX_FEEDER_SCHEDULE_SLOTS) {
    while (*cursor == ' ' || *cursor == ',') {
      cursor++;
    }
    if (*cursor == '\0') {
      break;
    }
    char* hourEnd = nullptr;
    long hour = strtol(cursor, &hourEnd, 10);
    if (hourEnd == cursor || *hourEnd != ':') {
      cursor = hourEnd ? hourEnd : cursor + 1;
      while (*cursor && *cursor != ',') {
        cursor++;
      }
      continue;
    }
    char* minuteStart = hourEnd + 1;
    char* minuteEnd = nullptr;
    long minute = strtol(minuteStart, &minuteEnd, 10);
    if (minuteEnd == minuteStart) {
      cursor = minuteEnd;
      continue;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      cursor = minuteEnd;
      continue;
    }
    feederScheduleSlots[feederScheduleSlotCount].hour = static_cast<uint8_t>(hour);
    feederScheduleSlots[feederScheduleSlotCount].minute = static_cast<uint8_t>(minute);
    feederScheduleSlots[feederScheduleSlotCount].completed = false;
    feederScheduleSlotCount++;
    cursor = minuteEnd;
    while (*cursor && *cursor != ',') {
      cursor++;
    }
    if (*cursor == ',') {
      cursor++;
    }
  }

  if (feederScheduleSlotCount == 0) {
    feederScheduleSlots[0] = {8, 0, false};
    feederScheduleSlots[1] = {18, 0, false};
    feederScheduleSlotCount = 2;
  }
}

void resetFeederSchedule() {
  for (uint8_t i = 0; i < feederScheduleSlotCount; ++i) {
    feederScheduleSlots[i].completed = false;
  }
}

void processFeederScheduleTick(uint8_t hour, uint8_t minute, uint8_t second, uint32_t nowUnix) {
  if (hour == 0 && minute == 0 && second < 5) {
    resetFeederSchedule();
  }
  if (feederScheduleSlotCount == 0) {
    return;
  }
  for (uint8_t i = 0; i < feederScheduleSlotCount; ++i) {
    FeederScheduleSlot& slot = feederScheduleSlots[i];
    if (slot.completed) {
      continue;
    }
    const uint8_t windowEnd = slot.minute >= 59 ? 59 : static_cast<uint8_t>(slot.minute + 1);
    if (hour == slot.hour && minute >= slot.minute && minute <= windowEnd) {
      bool started = startSmartFeedingCycle(nowUnix, "schedule");
      slot.completed = true;
      Serial.print(F("{\"feeder\":\"schedule\",\"slot\":"));
      Serial.print(i);
      Serial.print(F(",\"time\":\""));
      if (slot.hour < 10) Serial.print('0');
      Serial.print(slot.hour);
      Serial.print(':');
      if (slot.minute < 10) Serial.print('0');
      Serial.print(slot.minute);
      Serial.print(F("\",\"started\":"));
      Serial.print(started ? F("true") : F("false"));
      Serial.println(F("}"));
    }
  }
}

void stopSmartFeedingCycle(const char* reason) {
  (void)reason;
  if (!feederState.feedingActive) {
    feederState.manualButtonLatched = false;
    return;
  }
  closeFeederGate();
  feederState.feedingActive = false;
  feederState.manualButtonLatched = false;
  Serial.print(F("{\"feeder\":\"stop\",\"reason\":\""));
  Serial.print(reason ? reason : "manual");
  Serial.println(F("\"}"));
}

bool startSmartFeedingCycle(uint32_t nowUnix, const char* reason, float targetOverride, float minOverride) {
  if (feederState.calibrationMode) {
    Serial.println(F("{\"feeder\":\"blocked\",\"reason\":\"calibrating\"}"));
    return false;
  }
  if (feederState.feedingActive) {
    Serial.println(F("{\"feeder\":\"blocked\",\"reason\":\"active\"}"));
    return false;
  }
  bool scaleReady = false;
  #if ENABLE_HX711
  scaleReady = foodScaleSensor.is_ready();
  #endif

  if (targetOverride > 0.0f) {
    feederState.targetWeightGrams = targetOverride;
  }
  if (minOverride > 0.0f) {
    feederState.minWeightGrams = minOverride;
  }

  float bowlWeight = 0.0f;
  #if ENABLE_HX711
  if (scaleReady) {
    bowlWeight = readFoodWeightGrams();
    if (bowlWeight >= feederState.minWeightGrams - 1.0f) {
      Serial.print(F("{\"feeder\":\"skip\",\"weight\":"));
      Serial.print(bowlWeight, 2);
      Serial.println(F("}"));
      return false;
    }
  }
  #endif

  // 若秤重模組未就緒，改用定時開閘模式避免指令被 timeout
  if (!scaleReady) {
    feederState.feedingActive = true;
    feederState.manualButtonLatched = false;
    feederState.feedingStartedMs = millis();
    feederState.feedingStartedUnix = nowUnix;

    ensureServoAttached();
    openFeederGate(FEEDER_OPEN_DURATION_MS);
    delay(FEEDER_OPEN_DURATION_MS + 200);  // 預留收閘緩衝
    closeFeederGate();

    feederState.feedingActive = false;
    feederGateOpen = false;
    Serial.println(F("{\"feeder\":\"start\",\"reason\":\"fallback-no-scale\"}"));
    Serial.println(F("{\"feeder\":\"done\",\"weight\":0.00,\"fallback\":true}"));
    return true;
  }

  feederState.feedingActive = true;
  feederState.feedingStartedMs = millis();
  feederState.feedingStartedUnix = nowUnix;

  ensureServoAttached();
  feederServo.write(FEEDER_SERVO_OPEN_ANGLE);
  feederGateOpen = true;
  unsigned long started = millis();
  bool aborted = false;
  const char* abortSource = nullptr;
  bool fallbackUsed = false;

  Serial.print(F("{\"feeder\":\"start\",\"reason\":\""));
  Serial.print(reason ? reason : "manual");
  Serial.println(F("\"}"));

  while (bowlWeight < feederState.targetWeightGrams) {
    if (digitalRead(BTN_RESET_PIN) == LOW) {
      aborted = true;
      abortSource = "resetButton";
      Serial.println(F("{\"feeder\":\"abort\",\"source\":\"resetButton\"}"));
      break;
    }
    if (reason && strcmp(reason, "button") == 0 && digitalRead(BTN_FEED_PIN) == HIGH) {
      aborted = true;
      abortSource = "buttonReleased";
      Serial.println(F("{\"feeder\":\"abort\",\"source\":\"buttonReleased\"}"));
      break;
    }
    if ((millis() - started) > SMART_FEED_MAX_DURATION_MS) {
      aborted = true;
      abortSource = "timeout";
      Serial.println(F("{\"feeder\":\"abort\",\"source\":\"timeout\"}"));
      break;
    }
    delay(SMART_FEED_SAMPLE_DELAY_MS);
    bowlWeight = readFoodWeightGrams();
  }

  closeFeederGate();
  // 當秤重讀值卡住導致逾時，改用定時開閘備援，避免命令失敗
  if (aborted && abortSource && strcmp(abortSource, "timeout") == 0) {
    ensureServoAttached();
    openFeederGate(FEEDER_OPEN_DURATION_MS);
    delay(FEEDER_OPEN_DURATION_MS + 200);
    closeFeederGate();
    feederGateOpen = false;
    aborted = false;
    fallbackUsed = true;
    markFeedingEvent();
    Serial.println(F("{\"feeder\":\"fallback\",\"reason\":\"timeout\"}"));
  } else if (!aborted) {
    markFeedingEvent();
  }
  feederState.feedingActive = false;
  Serial.print(F("{\"feeder\":\"done\",\"weight\":"));
  Serial.print(bowlWeight, 2);
  Serial.print(F(",\"aborted\":"));
  Serial.print(aborted ? F("true") : F("false"));
  if (fallbackUsed) {
    Serial.print(F(",\"fallback\":true"));
  }
  Serial.println(F("}"));
  return !aborted;
}

void runInteractiveFeederCalibration() {
  if (!foodScaleSensor.is_ready()) {
    Serial.println(F("❌ HX711 not ready, aborting calibration"));
    return;
  }
  feederState.calibrationMode = true;
  Serial.println(F("🔧 Calibration Mode Started"));
  Serial.println(F("1️⃣ Remove all weight from the scale."));
  Serial.println(F("   Press Enter in Serial Monitor when ready..."));
  while (Serial.available() == 0) {
    delay(50);
  }
  while (Serial.available()) {
    Serial.read();
  }
  delay(500);
  long rawNoWeight = foodScaleSensor.read_average(20);
  Serial.print(F("📏 Raw no weight: "));
  Serial.println(rawNoWeight);
  Serial.println(F("2️⃣ Place a known weight on the scale."));
  Serial.println(F("   Enter the weight in grams (e.g., 50):"));
  while (Serial.available() == 0) {
    delay(50);
  }
  float knownWeight = Serial.parseFloat();
  Serial.print(F("✅ Known weight entered: "));
  Serial.print(knownWeight, 2);
  Serial.println(F(" g"));
  delay(1500);
  long rawWithWeight = foodScaleSensor.read_average(20);
  Serial.print(F("📏 Raw with weight: "));
  Serial.println(rawWithWeight);
  long diff = rawWithWeight - rawNoWeight;
  if (diff == 0 || knownWeight <= 0.0f) {
    Serial.println(F("❌ Error: Invalid readings. Calibration aborted."));
    feederState.calibrationMode = false;
    return;
  }
  foodScale = knownWeight / static_cast<float>(diff);
  Serial.print(F("✅ New scale factor: "));
  Serial.println(foodScale, 5);
  delay(1000);
  foodZeroRaw = rawNoWeight;
  lastFoodRaw = rawWithWeight;
  float finalReading = readFoodWeightGrams();
  Serial.print(F("📦 Final verification reading: "));
  Serial.print(finalReading, 2);
  Serial.println(F(" g"));
  feederState.calibrationMode = false;
}

void handleFeederButtons() {
  const unsigned long now = millis();

  int tareState = digitalRead(BTN_TARE_PIN);
  if (tareState != tareButtonPrev && (now - tareButtonLastMs) > BUTTON_DEBOUNCE_MS) {
    tareButtonLastMs = now;
    tareButtonPrev = tareState;
    if (tareState == LOW) {
      tareFoodScale(25);
      Serial.print(F("{\"event\":\"tare\",\"source\":\"button\",\"foodZeroRaw\":"));
      Serial.print(foodZeroRaw);
      Serial.println(F("}"));
    }
  }

  int resetState = digitalRead(BTN_RESET_PIN);
  if (resetState != resetButtonPrev && (now - resetButtonLastMs) > BUTTON_DEBOUNCE_MS) {
    resetButtonLastMs = now;
    resetButtonPrev = resetState;
    if (resetState == LOW) {
      stopSmartFeedingCycle("button");
    }
  }

  int calState = digitalRead(BTN_CAL_PIN);
  if (calState != calButtonPrev && (now - calButtonLastMs) > BUTTON_DEBOUNCE_MS) {
    calButtonLastMs = now;
    calButtonPrev = calState;
    if (calState == LOW) {
      runInteractiveFeederCalibration();
    }
  }

  int feedState = digitalRead(BTN_FEED_PIN);
  if (feedState != feedButtonPrev && (now - feedButtonLastMs) > BUTTON_DEBOUNCE_MS) {
    feedButtonLastMs = now;
    feedButtonPrev = feedState;
    feederState.manualButtonLatched = (feedState == LOW);
    if (feedState == LOW) {
      startSmartFeedingCycle(0, "button");
    }
  }
}
#endif

#if ENABLE_HYDRATION
int readWaterLevel(int samples) {
  long total = 0;
  for (int i = 0; i < samples; ++i) {
    total += analogRead(WATER_SENSOR_PIN);
    delay(5);
  }
  int level = samples > 0 ? static_cast<int>(total / samples) : analogRead(WATER_SENSOR_PIN);
  hydrationState.waterLevel = level;
  return level;
}

void runHydrationBurst(const char* reason, uint32_t nowUnix, unsigned long durationMs) {
  int waterLevel = readWaterLevel(8);
  Serial.print(F("Initial average water level: "));
  Serial.println(waterLevel);
  Serial.print(F("{\"hydration\":\"start\",\"reason\":\""));
  Serial.print(reason ? reason : "auto");
  Serial.print(F("\",\"level\":"));
  Serial.print(waterLevel);
  Serial.println(F("}"));

  uint8_t retryCount = 0;
  while (waterLevel < WATER_THRESHOLD && retryCount < 3) {
    Serial.print(F("Water low. Pumping attempt "));
    Serial.println(retryCount + 1);
    retryCount++;
    hydrationState.pumpActive = true;
    digitalWrite(WATER_PUMP_PIN, HIGH);
    delay(durationMs);
    digitalWrite(WATER_PUMP_PIN, LOW);
    hydrationState.pumpActive = false;
    delay(3000);
    waterLevel = readWaterLevel(8);
    Serial.print(F("{\"hydration\":\"pulse\",\"attempt\":"));
    Serial.print(retryCount);
    Serial.print(F(",\"level\":"));
    Serial.print(waterLevel);
    Serial.println(F("}"));
    Serial.print(F("Water level after attempt "));
    Serial.print(retryCount);
    Serial.print(F(": "));
    Serial.println(waterLevel);
  }

  hydrationState.lastRefillMs = millis();
  hydrationState.lastRefillUnix = nowUnix;
  hydrationState.pumpActive = false;
  Serial.print(F("{\"hydration\":\"complete\",\"level\":"));
  Serial.print(waterLevel);
  Serial.print(F(",\"attempts\":"));
  Serial.print(retryCount);
  Serial.println(F("}"));
  if (waterLevel >= WATER_THRESHOLD) {
    Serial.println(F("Water level sufficient after pumping."));
  } else {
    Serial.println(F("Max retries reached. Water still low."));
  }
}

void handleManualWaterButton(unsigned long nowMs, uint32_t nowUnix) {
  if (hydrationState.startupMs == 0) {
    hydrationState.startupMs = nowMs;
  }
  if ((nowMs - hydrationState.startupMs) < 5000UL) {
    return;
  }

  bool buttonPressed = digitalRead(BTN_WATER_PIN) == LOW;
  if (buttonPressed) {
    hydrationState.manualButtonPressed = true;
    int waterLevel = readWaterLevel(6);
    Serial.print(F("Manual button triggered - Current water level: "));
    Serial.println(waterLevel);
    if (waterLevel < WATER_THRESHOLD) {
      if (!hydrationState.pumpActive) {
        digitalWrite(WATER_PUMP_PIN, HIGH);
        hydrationState.pumpActive = true;
        hydrationState.manualOverrideActive = true;
        Serial.println(F("{\"hydration\":\"manualPumpOn\"}"));
      }
    } else if (hydrationState.pumpActive) {
      digitalWrite(WATER_PUMP_PIN, LOW);
      hydrationState.pumpActive = false;
      hydrationState.manualOverrideActive = false;
      Serial.println(F("{\"hydration\":\"manualThresholdReached\"}"));
      Serial.println(F("Water level sufficient - Pump stopped."));
    }
  } else if (hydrationState.manualButtonPressed) {
    hydrationState.manualButtonPressed = false;
    if (hydrationState.pumpActive) {
      digitalWrite(WATER_PUMP_PIN, LOW);
      hydrationState.pumpActive = false;
    }
    hydrationState.manualOverrideActive = false;
    hydrationState.lastRefillMs = nowMs;
    hydrationState.lastRefillUnix = nowUnix;
    int finalLevel = readWaterLevel(6);
    Serial.print(F("{\"hydration\":\"manualStop\",\"level\":"));
    Serial.print(finalLevel);
    Serial.println(F("}"));
    Serial.print(F("Button released - Final stable water level: "));
    Serial.println(finalLevel);
  }
}

void resetDailyHydrationFlags() {
  hydrationState.hasPumpedMorning = false;
  hydrationState.hasPumpedNoon = false;
  hydrationState.hasPumpedAfternoon = false;
  hydrationState.hasPumpedEvening = false;
  hydrationState.hasResetToday = true;
  Serial.println(F("{\"hydration\":\"resetFlags\"}"));
  Serial.println(F("Flags reset for new day."));
}

void processHydrationScheduleTick(uint8_t hour, uint8_t minute, uint32_t nowUnix) {
  if (hour == 0 && minute == 0 && !hydrationState.hasResetToday) {
    resetDailyHydrationFlags();
  }
  if (hour > 0 && hydrationState.hasResetToday) {
    hydrationState.hasResetToday = false;
  }
  if (hydrationState.manualOverrideActive) {
    return;
  }
  if (hour == 8 && minute < 2 && !hydrationState.hasPumpedMorning) {
    Serial.println(F("Scheduled hydration triggered: Morning"));
    runHydrationBurst("08:00", nowUnix, 1000UL);
    hydrationState.hasPumpedMorning = true;
  }
  if (hour == 12 && minute < 2 && !hydrationState.hasPumpedNoon) {
    Serial.println(F("Scheduled hydration triggered: Noon"));
    runHydrationBurst("12:00", nowUnix, 1000UL);
    hydrationState.hasPumpedNoon = true;
  }
  if (hour == 16 && minute < 2 && !hydrationState.hasPumpedAfternoon) {
    Serial.println(F("Scheduled hydration triggered: Afternoon"));
    runHydrationBurst("16:00", nowUnix, 1000UL);
    hydrationState.hasPumpedAfternoon = true;
  }
  if (hour == 20 && minute < 2 && !hydrationState.hasPumpedEvening) {
    Serial.println(F("Scheduled hydration triggered: Evening"));
    runHydrationBurst("20:00", nowUnix, 1000UL);
    hydrationState.hasPumpedEvening = true;
  }
}
#endif

#if ENABLE_AUDIO
// =======================
// Audio Amplifier (8002)
// 8002 单声道音频功放芯片配置
// SD (Shutdown) 引脚：HIGH = 工作，LOW = 关断
// =======================
static const AudioSequenceStep AUDIO_PATTERN_CALL_STEPS[] PROGMEM = {
  // 🐱 真实猫叫模拟 - 模仿"喵～"的声音
  // 第一声"喵" (meow 1)
  {450, 60, 70},    // 起音 - 低频开始
  {520, 50, 80},    // 快速上升
  {620, 50, 85},
  {750, 80, 90},    // 到达峰值
  {820, 90, 95},    // 高峰持续
  {780, 70, 90},    // 轻微颤音
  {820, 60, 90},
  {750, 80, 85},    // 下降
  {620, 70, 75},
  {500, 60, 65},    // 尾音
  {0, 200, 0},      // 短暂停顿

  // 第二声"喵" (meow 2 - 稍短促)
  {480, 50, 75},
  {580, 50, 85},
  {720, 70, 90},
  {850, 80, 95},    // 更高音
  {800, 60, 90},
  {680, 60, 80},
  {540, 50, 70},
  {0, 300, 0},      // 较长停顿

  // 第三声"喵～" (长尾音，像在呼唤)
  {460, 60, 70},
  {540, 60, 80},
  {650, 70, 85},
  {780, 100, 92},   // 峰值持续更久
  {820, 90, 95},
  {800, 80, 93},
  {760, 90, 90},    // 颤音效果
  {800, 70, 92},
  {760, 80, 88},
  {720, 100, 85},   // 缓慢下降
  {640, 90, 78},
  {560, 80, 70},
  {480, 100, 60},   // 长尾音
  {0, 0, 0},        // 结束
};

static const AudioSequenceStep AUDIO_PATTERN_CALM_STEPS[] PROGMEM = {
  {440, 420, 70},
  {494, 420, 70},
  {523, 420, 70},
  {0, 200, 0},
  {494, 420, 70},
  {440, 420, 70},
  {0, 0, 0},
};

static const AudioSequenceStep AUDIO_PATTERN_ALERT_STEPS[] PROGMEM = {
  {1319, 180, 100},
  {0, 80, 0},
  {1479, 180, 100},
  {0, 80, 0},
  {1568, 200, 100},
  {0, 0, 0},
};

static const AudioSequenceStep AUDIO_PATTERN_WAKE_STEPS[] PROGMEM = {
  {880, 220, 90},
  {988, 220, 90},
  {1175, 300, 90},
  {0, 120, 0},
  {1397, 320, 100},
  {1568, 360, 100},
  {0, 0, 0},
};

static const AudioSequenceStep AUDIO_PATTERN_HYDRATE_STEPS[] PROGMEM = {
  {698, 200, 80},
  {932, 180, 80},
  {0, 120, 0},
  {784, 200, 80},
  {988, 220, 80},
  {0, 140, 0},
  {880, 240, 85},
  {659, 320, 70},
  {0, 0, 0},
};

static const AudioSequenceStep AUDIO_PATTERN_MEOW_STEPS[] PROGMEM = {
  {523, 160, 90},
  {587, 160, 90},
  {659, 220, 95},
  {622, 140, 70},
  {587, 160, 60},
  {659, 220, 95},
  {698, 260, 95},
  {622, 220, 70},
  {0, 140, 0},
  {523, 160, 85},
  {587, 160, 85},
  {659, 200, 95},
  {0, 0, 0},
};

struct AudioRuntimeState {
  AudioPattern activePattern;
  uint8_t repeatRemaining;
  uint8_t stepIndex;
  bool stepArmed;
  unsigned long stepStartedMs;
  unsigned long lastTriggerMs;
};

constexpr uint8_t AUDIO_SIGNAL_PIN = 52;  // PWM音频信号输出引脚（连接到8002的IN+）
constexpr int8_t AUDIO_ENABLE_PIN = -1;   // 未使用 SD/Shutdown 腳
constexpr uint8_t AUDIO_DEFAULT_VOLUME_PERCENT = 70;
constexpr uint8_t AUDIO_MAX_VOLUME_PERCENT = 100;

AudioRuntimeState audioState = {
  AUDIO_PATTERN_NONE,
  0,
  0,
  false,
  0UL,
  0UL,
};
AudioPattern audioLastPattern = AUDIO_PATTERN_NONE;
bool audioModuleReady = false;
bool audioMuted = false;
uint8_t audioVolumePercent = AUDIO_DEFAULT_VOLUME_PERCENT;

inline void audioSetEnablePin(bool on) {
  if (AUDIO_ENABLE_PIN >= 0) {
    digitalWrite(AUDIO_ENABLE_PIN, on ? HIGH : LOW);
  }
}

const char* audioPatternName(AudioPattern pattern) {
  switch (pattern) {
    case AUDIO_PATTERN_CALL:
      return "call-cat";
    case AUDIO_PATTERN_CALM:
      return "calm-chime";
    case AUDIO_PATTERN_ALERT:
      return "alert";
    case AUDIO_PATTERN_WAKE:
      return "wake-up-lullaby";
    case AUDIO_PATTERN_HYDRATE:
      return "hydrate-reminder";
    case AUDIO_PATTERN_MEOW:
      return "meow-call";
    default:
      return "none";
  }
}

AudioPattern audioPatternFromString(const char* value) {
  if (!value) {
    return AUDIO_PATTERN_CALL;
  }
  if (strcmp(value, "call") == 0 || strcmp(value, "call-cat") == 0) {
    return AUDIO_PATTERN_CALL;
  }
  if (strcmp(value, "calm") == 0 || strcmp(value, "calm-chime") == 0 || strcmp(value, "lullaby") == 0) {
    return AUDIO_PATTERN_CALM;
  }
  if (strcmp(value, "alert") == 0 || strcmp(value, "alarm") == 0) {
    return AUDIO_PATTERN_ALERT;
  }
  if (strcmp(value, "wake-up") == 0 || strcmp(value, "wake") == 0 || strcmp(value, "wake-up-lullaby") == 0) {
    return AUDIO_PATTERN_WAKE;
  }
  if (strcmp(value, "hydrate") == 0 || strcmp(value, "hydrate-reminder") == 0 || strcmp(value, "water-reminder") == 0) {
    return AUDIO_PATTERN_HYDRATE;
  }
  if (strcmp(value, "meow") == 0 || strcmp(value, "meow-call") == 0) {
    return AUDIO_PATTERN_MEOW;
  }
  return AUDIO_PATTERN_CALL;
}

const AudioSequenceStep* audioSequenceForPattern(AudioPattern pattern) {
  switch (pattern) {
    case AUDIO_PATTERN_CALL:
      return AUDIO_PATTERN_CALL_STEPS;
    case AUDIO_PATTERN_CALM:
      return AUDIO_PATTERN_CALM_STEPS;
    case AUDIO_PATTERN_ALERT:
      return AUDIO_PATTERN_ALERT_STEPS;
    case AUDIO_PATTERN_WAKE:
      return AUDIO_PATTERN_WAKE_STEPS;
    case AUDIO_PATTERN_HYDRATE:
      return AUDIO_PATTERN_HYDRATE_STEPS;
    case AUDIO_PATTERN_MEOW:
      return AUDIO_PATTERN_MEOW_STEPS;
    default:
      return nullptr;
  }
}

AudioSequenceStep audioStepFromProgmem(const AudioSequenceStep* base, uint8_t index) {
  AudioSequenceStep step;
  memcpy_P(&step, base + index, sizeof(AudioSequenceStep));
  return step;
}

void audioStopPlayback() {
  noTone(AUDIO_SIGNAL_PIN);
  audioSetEnablePin(false);
  audioState.activePattern = AUDIO_PATTERN_NONE;
  audioState.repeatRemaining = 0;
  audioState.stepIndex = 0;
  audioState.stepArmed = false;
}

void audioStartStep(const AudioSequenceStep& step) {
  if (step.durationMs == 0 || audioMuted) {
    audioStopPlayback();
    return;
  }

  if (step.frequencyHz == 0) {
    noTone(AUDIO_SIGNAL_PIN);
    audioSetEnablePin(false);
  } else {
    audioSetEnablePin(true);
    tone(AUDIO_SIGNAL_PIN, step.frequencyHz);
  }

  audioState.stepArmed = true;
  audioState.stepStartedMs = millis();
}

void audioInit() {
  pinMode(AUDIO_SIGNAL_PIN, OUTPUT);
  digitalWrite(AUDIO_SIGNAL_PIN, LOW);
  if (AUDIO_ENABLE_PIN >= 0) {
    pinMode(AUDIO_ENABLE_PIN, OUTPUT);
    digitalWrite(AUDIO_ENABLE_PIN, LOW);
  }
  audioModuleReady = true;
  audioMuted = false;
  audioVolumePercent = AUDIO_DEFAULT_VOLUME_PERCENT;
  audioState.activePattern = AUDIO_PATTERN_NONE;
}

void audioSetMute(bool muted) {
  if (!audioModuleReady) {
    return;
  }
  if (audioMuted == muted) {
    return;
  }
  audioMuted = muted;
  if (muted) {
    audioStopPlayback();
  }
}

void audioSetVolume(uint8_t percent) {
  if (!audioModuleReady) {
    return;
  }
  if (percent > AUDIO_MAX_VOLUME_PERCENT) {
    percent = AUDIO_MAX_VOLUME_PERCENT;
  }
  audioVolumePercent = percent;
}

void audioPlayPattern(AudioPattern pattern, uint8_t repeat) {
  if (!audioModuleReady) {
    Serial.println(F("{\"audio\":\"moduleNotReady\"}"));
    return;
  }
  if (pattern == AUDIO_PATTERN_NONE) {
    audioStopPlayback();
    return;
  }
  if (repeat == 0) {
    repeat = 1;
  }

  audioLastPattern = pattern;
  audioState.lastTriggerMs = millis();

  if (audioMuted) {
    audioStopPlayback();
    Serial.print(F("{\"audio\":\"muted\",\"pattern\":\""));
    printEscapedJson(audioPatternName(pattern));
    Serial.println(F("\"}"));
    return;
  }

  audioState.activePattern = pattern;
  audioState.repeatRemaining = repeat;
  audioState.stepIndex = 0;
  audioState.stepArmed = false;

  Serial.print(F("{\"audio\":\"play\",\"pattern\":\""));
  printEscapedJson(audioPatternName(pattern));
  Serial.println(F("\"}"));
}

bool audioIsPlaying() {
  return audioModuleReady && !audioMuted && audioState.activePattern != AUDIO_PATTERN_NONE && audioState.stepArmed;
}

void audioUpdate() {
  if (!audioModuleReady) {
    return;
  }
  if (audioMuted) {
    audioStopPlayback();
    return;
  }
  if (audioState.activePattern == AUDIO_PATTERN_NONE) {
    audioStopPlayback();
    return;
  }

  const AudioSequenceStep* sequence = audioSequenceForPattern(audioState.activePattern);
  if (!sequence) {
    audioStopPlayback();
    return;
  }

  AudioSequenceStep step = audioStepFromProgmem(sequence, audioState.stepIndex);
  if (step.durationMs == 0) {
    if (audioState.repeatRemaining > 1) {
      audioState.repeatRemaining -= 1;
      audioState.stepIndex = 0;
      step = audioStepFromProgmem(sequence, audioState.stepIndex);
    } else {
      audioStopPlayback();
      Serial.println(F("{\"audio\":\"complete\"}"));
      return;
    }
  }

  if (!audioState.stepArmed) {
    audioStartStep(step);
    return;
  }

  const unsigned long now = millis();
  if (now - audioState.stepStartedMs >= step.durationMs) {
    audioState.stepIndex += 1;
    audioState.stepArmed = false;
  }
}
#endif

// 🔒 修复：JSON 字符串转义辅助函数
// Fix: JSON string escape helper function
void printEscapedJson(const char* str) {
  for (size_t i = 0; str[i] != '\0'; i++) {
    char c = str[i];
    switch (c) {
      case '"':  Serial.print(F("\\\"")); break;
      case '\\': Serial.print(F("\\\\")); break;
      case '\n': Serial.print(F("\\n")); break;
      case '\r': Serial.print(F("\\r")); break;
      case '\t': Serial.print(F("\\t")); break;
      default:
        if (c >= 32 && c <= 126) {  // 可打印 ASCII / Printable ASCII
          Serial.print(c);
        } else {
          // 非打印字符显示为 \xHH / Non-printable as \xHH
          Serial.print(F("\\x"));
          if (c < 16) Serial.print('0');
          Serial.print((unsigned char)c, HEX);
        }
        break;
    }
  }
}

#if ENABLE_OLED
void oledRenderSummary(float temperatureC, float humidityPercent, float waterLevelPercent, float foodWeightGrams, bool feederOpen) {
  if (!oledReady) {
    return;
  }

  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);

  char line[22];

  if (isnan(temperatureC)) {
    snprintf(line, sizeof(line), "Temp: --.- C");
  } else {
    snprintf(line, sizeof(line), "Temp: %5.1f C", temperatureC);
  }
  oled.println(line);

  if (isnan(humidityPercent)) {
    snprintf(line, sizeof(line), "Hum : -- %");
  } else {
    snprintf(line, sizeof(line), "Hum : %5.1f%%", humidityPercent);
  }
  oled.println(line);

  if (waterLevelPercent < 0.0f) {
    snprintf(line, sizeof(line), "Water: -- %%");
  } else {
    snprintf(line, sizeof(line), "Water: %5.1f%%", waterLevelPercent);
  }
  oled.println(line);

  if (foodWeightGrams < 0.0f) {
    foodWeightGrams = 0.0f;
  }
  snprintf(line, sizeof(line), "Food: %6.1fg", foodWeightGrams);
  oled.println(line);

  snprintf(line, sizeof(line), "Gate: %s", feederOpen ? "OPEN" : "CLOSE");
  oled.println(line);

  oled.display();
}
#endif

#if ENABLE_ST021
bool initSt021() {
  if (!probeI2cDevice(ST021_ADDRESS, 250)) {
    return false;
  }
  return true;
}

bool st021ReadRaw(uint8_t command, uint16_t& raw) {
  if (!st021Ready) {
    return false;
  }
  Wire.beginTransmission(ST021_ADDRESS);
  Wire.write(command);
  if (Wire.endTransmission(true) != 0) {
    return false;
  }
  delay(85);  // max conversion time ~85 ms
  Wire.requestFrom(ST021_ADDRESS, static_cast<uint8_t>(3));
  if (Wire.available() < 3) {
    return false;
  }

  // 读取 3 字节：MSB, LSB, CRC / Read 3 bytes: MSB, LSB, CRC
  uint8_t msb = Wire.read();
  uint8_t lsb = Wire.read();
  uint8_t receivedCRC = Wire.read();

  // 🔒 验证 CRC 校验和 / Validate CRC checksum
  uint8_t data[2] = {msb, lsb};
  uint8_t computedCRC = st021ComputeCRC(data, 2);

  if (computedCRC != receivedCRC) {
    // CRC 校验失败，数据可能损坏 / CRC check failed, data may be corrupted
    Serial.print(F("{\"warning\":\"st021CrcFail\",\"expected\":"));
    Serial.print(computedCRC);
    Serial.print(F(",\"received\":"));
    Serial.print(receivedCRC);
    Serial.println(F("}"));
    return false;
  }

  // CRC 正确，返回原始值 / CRC correct, return raw value
  uint16_t value = static_cast<uint16_t>(msb) << 8;
  value |= static_cast<uint16_t>(lsb);
  raw = value & 0xFFFC;  // 清除状态位 / Clear status bits
  return true;
}

float readSt021TemperatureC() {
  uint16_t raw = 0;
  if (!st021ReadRaw(ST021_CMD_TEMPERATURE, raw)) {
    return NAN;
  }
  return -46.85f + (175.72f * raw) / 65536.0f;
}

float readSt021HumidityPercent() {
  uint16_t raw = 0;
  if (!st021ReadRaw(ST021_CMD_HUMIDITY, raw)) {
    return NAN;
  }
  return -6.0f + (125.0f * raw) / 65536.0f;
}
#endif

#if ENABLE_DS3231
String formatIsoTimestamp(const DateTime& dt) {
  char buffer[25];
  snprintf(buffer, sizeof(buffer), "%04u-%02u-%02uT%02u:%02u:%02uZ",
           dt.year(), dt.month(), dt.day(),
           dt.hour(), dt.minute(), dt.second());
  return String(buffer);
}
#endif

void markFeedingEvent() {
  lastFeedingMillis = millis();
#if ENABLE_DS3231
  if (rtcReady) {
    lastFeedingUnix = rtc.now().unixtime();
  }
#endif
}

// 🔒 改进版：带输入验证的校准命令处理 / Improved: calibration command processing with input validation
void processCalibrationCommand(const JsonObject& payload) {
  bool anyUpdated = false;

  // 食盆零點（HX711 原始值）/ Food scale baseline
#if ENABLE_HX711
  if (payload.containsKey("foodZeroRaw") || payload.containsKey("fsrZero")) {
    long newZero = payload.containsKey("foodZeroRaw")
      ? payload["foodZeroRaw"].as<long>()
      : payload["fsrZero"].as<long>();
    foodZeroRaw = newZero;
    lastFoodWeightGrams = 0.0f;
    anyUpdated = true;
  }

  // 食盆比例（raw→grams）/ Food scale factor
  if (payload.containsKey("foodScale") || payload.containsKey("fsrScale")) {
    float newScale = payload.containsKey("foodScale")
      ? payload["foodScale"].as<float>()
      : payload["fsrScale"].as<float>();
    if (newScale > 0.000001f && newScale < 1000.0f) {
      foodScale = newScale;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"foodScale out of range\",\"value\":"));
      Serial.print(newScale, 6);
      Serial.println(F(",\"expected\":\">0\"}"));
    }
  }

  if (payload.containsKey("foodReferenceGrams")) {
    const float candidate = payload["foodReferenceGrams"].as<float>();
    if (candidate > 0.0f) {
      foodReferenceWeightGrams = candidate;
      Serial.print(F("{\"info\":\"foodReferenceUpdated\",\"value\":"));
      Serial.print(candidate, 2);
      Serial.println(F("}"));
    }
  }
#endif

  // Water Level Full - 超声波到满水位距离（1-50cm）/ Water level full - ultrasonic to full water distance (1-50cm)
  if (payload.containsKey("waterLevelFullCm")) {
    float newWaterLevelFull = payload["waterLevelFullCm"].as<float>();
    if (newWaterLevelFull >= 1.0f && newWaterLevelFull <= 50.0f) {
      waterLevelFullCm = newWaterLevelFull;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"waterLevelFullCm out of range\",\"value\":"));
      Serial.print(newWaterLevelFull);
      Serial.println(F(",\"expected\":\"1-50\"}"));
    }
  }

  // Water Level Empty - 超声波到空水位距离（1-50cm）/ Water level empty - ultrasonic to empty water distance (1-50cm)
  if (payload.containsKey("waterLevelEmptyCm")) {
    float newWaterLevelEmpty = payload["waterLevelEmptyCm"].as<float>();
    if (newWaterLevelEmpty >= 1.0f && newWaterLevelEmpty <= 50.0f) {
      waterLevelEmptyCm = newWaterLevelEmpty;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"waterLevelEmptyCm out of range\",\"value\":"));
      Serial.print(newWaterLevelEmpty);
      Serial.println(F(",\"expected\":\"1-50\"}"));
    }
  }

  // LDR Dark - 暗环境 ADC 值（0-1023）/ LDR dark - dark environment ADC value (0-1023)
  if (payload.containsKey("ldrDark")) {
    int newLdrDark = payload["ldrDark"].as<int>();
    if (newLdrDark >= 0 && newLdrDark <= 1023) {
      ldrDarkRef = newLdrDark;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"ldrDark out of range\",\"value\":"));
      Serial.print(newLdrDark);
      Serial.println(F(",\"expected\":\"0-1023\"}"));
    }
  }

  // LDR Bright - 亮环境 ADC 值（0-1023）/ LDR bright - bright environment ADC value (0-1023)
  if (payload.containsKey("ldrBright")) {
    int newLdrBright = payload["ldrBright"].as<int>();
    if (newLdrBright >= 0 && newLdrBright <= 1023) {
      ldrBrightRef = newLdrBright;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"ldrBright out of range\",\"value\":"));
      Serial.print(newLdrBright);
      Serial.println(F(",\"expected\":\"0-1023\"}"));
    }
  }

  // Cat Presence Threshold - 猫存在阈值（0.1-20kg）/ Cat presence threshold (0.1-20kg)
  if (payload.containsKey("catPresenceThresholdKg")) {
    float newThreshold = payload["catPresenceThresholdKg"].as<float>();
    if (newThreshold >= 0.1f && newThreshold <= 20.0f) {
      catPresenceThresholdKg = newThreshold;
      anyUpdated = true;
    } else {
      Serial.print(F("{\"error\":\"catPresenceThresholdKg out of range\",\"value\":"));
      Serial.print(newThreshold);
      Serial.println(F(",\"expected\":\"0.1-20\"}"));
    }
  }

  if (anyUpdated) {
    // 重置追踪变量，使用新校准重新计算 / Reset tracking variables to recalculate with new calibration
    lastWaterLevelPercent = 100.0f;
    cumulativeWaterIntakeMl = 0.0f;
    Serial.println(F("{\"status\":\"calibrationUpdated\"}"));
  }
}

void processSettingsCommand(const JsonObject& payload) {
  if (payload.containsKey("waterBowlLevelTargetMl")) {
    waterBowlCapacityMl = payload["waterBowlLevelTargetMl"].as<float>();
    waterBowlCapacityMl = max(50.0f, waterBowlCapacityMl);
  }
  if (payload.containsKey("catPresenceThresholdKg")) {
    catPresenceThresholdKg = payload["catPresenceThresholdKg"].as<float>();
  }

#if ENABLE_HX711
  if (payload.containsKey("feederOpenMs")) {
    unsigned long duration = payload["feederOpenMs"].as<unsigned long>();
    if (duration >= 500UL && duration <= 15000UL) {
      feederOpenDurationMs = duration;
    }
  }
  if (payload.containsKey("feederTargetGrams")) {
    float nextTarget = payload["feederTargetGrams"].as<float>();
    if (nextTarget >= 5.0f && nextTarget <= 500.0f) {
      feederState.targetWeightGrams = nextTarget;
    }
  }
  if (payload.containsKey("feederMinGrams")) {
    float nextMin = payload["feederMinGrams"].as<float>();
    if (nextMin >= 0.0f && nextMin <= feederState.targetWeightGrams) {
      feederState.minWeightGrams = nextMin;
    }
  }
  if (payload.containsKey("feederSchedule")) {
    const char* schedule = payload["feederSchedule"].as<const char*>();
    if (schedule && strlen(schedule) > 0) {
      applyFeederScheduleString(schedule);
    }
  }
  unsigned long feedDurationOverride = 0;
  if (payload.containsKey("feedDurationMs")) {
    feedDurationOverride = payload["feedDurationMs"].as<unsigned long>();
  }
  if (payload.containsKey("feedNow") && payload["feedNow"].as<bool>()) {
    float targetOverride = payload.containsKey("feedTargetGrams") ? payload["feedTargetGrams"].as<float>() : 0.0f;
    float minOverride = payload.containsKey("feedMinGrams") ? payload["feedMinGrams"].as<float>() : 0.0f;
    if (!startSmartFeedingCycle(0, "settings", targetOverride, minOverride)) {
      if (feedDurationOverride >= 500UL && feedDurationOverride <= 15000UL) {
        openFeederGate(feedDurationOverride);
      } else {
        openFeederGate();
      }
      markFeedingEvent();
    }
  }
#endif
}

#if ENABLE_AUDIO
void processAudioCommand(const JsonObject& payload) {
  const char* actionRaw = payload.containsKey("action") ? payload["action"].as<const char*>() : nullptr;
  const char* action = (actionRaw && strlen(actionRaw) > 0) ? actionRaw : "playPattern";

  if (!audioModuleReady) {
    Serial.println(F("{\"audio\":\"moduleNotReady\"}"));
    return;
  }

  if (strcmp(action, "playPattern") == 0 || strcmp(action, "play") == 0) {
    const char* patternRaw = payload.containsKey("pattern") ? payload["pattern"].as<const char*>() : nullptr;
    const char* patternName = (patternRaw && strlen(patternRaw) > 0) ? patternRaw : "call-cat";
    uint8_t repeat = payload.containsKey("repeat") ? payload["repeat"].as<uint8_t>() : 1;
    audioPlayPattern(audioPatternFromString(patternName), repeat);
    return;
  }

  if (strcmp(action, "stop") == 0) {
    audioStopPlayback();
    Serial.println(F("{\"audio\":\"stopped\"}"));
    return;
  }

  if (strcmp(action, "mute") == 0) {
    bool muted = payload.containsKey("muted") ? payload["muted"].as<bool>() : true;
    audioSetMute(muted);
    Serial.print(F("{\"audio\":\"mute\",\"muted\":"));
    Serial.print(muted ? F("true") : F("false"));
    Serial.println(F("}"));
    return;
  }

  if (strcmp(action, "unmute") == 0) {
    audioSetMute(false);
    Serial.println(F("{\"audio\":\"mute\",\"muted\":false}"));
    return;
  }

  if (strcmp(action, "setVolume") == 0 || strcmp(action, "volume") == 0) {
    int volume = -1;
    if (payload.containsKey("volumePercent")) {
      volume = payload["volumePercent"].as<int>();
    } else if (payload.containsKey("volume")) {
      volume = payload["volume"].as<int>();
    }

    if (volume >= 0) {
      audioSetVolume(static_cast<uint8_t>(volume));
      Serial.print(F("{\"audio\":\"volume\",\"percent\":"));
      Serial.print(audioVolumePercent);
      Serial.println(F("}"));
    } else {
      Serial.println(F("{\"audio\":\"volume\",\"error\":\"missingVolume\"}"));
    }
    return;
  }

  Serial.print(F("{\"audio\":\"unsupportedAction\",\"action\":\""));
  if (action) {
    printEscapedJson(action);
  }
  Serial.println(F("\"}"));
}
#endif

#if ENABLE_UV_FAN
void processUvFanCommand(const JsonObject& payload) {
  const char* actionRaw = payload.containsKey("action") ? payload["action"].as<const char*>() : nullptr;
  const char* action = (actionRaw && strlen(actionRaw) > 0) ? actionRaw : "setState";

  // DEBUG: 記錄 UV/Fan 命令開始處理
  Serial.print(F("[CMD_DEBUG] processUvFanCommand: action=\""));
  Serial.print(action);
  Serial.println(F("\""));

  const unsigned long nowMs = millis();
  uint32_t nowUnix = 0;
#if ENABLE_DS3231
  if (rtcReady) {
    nowUnix = rtc.now().unixtime();
  }
#endif

  if (strcmp(action, "startCleaning") == 0) {
    unsigned long duration = UV_CLEAN_DURATION_MS;
    if (payload.containsKey("durationMs")) {
      duration = payload["durationMs"].as<unsigned long>();
    }
    uvFanStartCleaning(duration, nowMs, nowUnix);
    Serial.println(F("{\"uvFan\":\"cleaning\",\"status\":\"started\"}"));
    return;
  }

  if (strcmp(action, "stopCleaning") == 0) {
    uvFanStopCleaning(false, nowMs, nowUnix);
    Serial.println(F("{\"uvFan\":\"cleaning\",\"status\":\"stopped\"}"));
    return;
  }

  if (strcmp(action, "setAutoMode") == 0) {
    bool enabled = payload.containsKey("autoMode") ? payload["autoMode"].as<bool>() : true;
    uvFanSetAutoMode(enabled, nowMs, nowUnix);
    Serial.print(F("{\"uvFan\":\"autoMode\",\"enabled\":"));
    Serial.print(enabled ? F("true") : F("false"));
    Serial.println(F("}"));
    return;
  }

  if (strcmp(action, "setState") == 0 || strcmp(action, "manual") == 0) {
    const bool hasUv = payload.containsKey("uvOn");
    const bool hasFan = payload.containsKey("fanOn");
    if (payload.containsKey("autoMode")) {
      uvFanSetAutoMode(payload["autoMode"].as<bool>(), nowMs, nowUnix);
    }
    if (hasUv || hasFan) {
      bool nextUv = hasUv ? payload["uvOn"].as<bool>() : uvFanState.uvOn;
      bool nextFan = hasFan ? payload["fanOn"].as<bool>() : uvFanState.fanOn;
      uvFanApplyManualState(nextUv, nextFan, nowMs, nowUnix);
    }
    Serial.println(F("{\"uvFan\":\"stateUpdated\"}"));
    return;
  }

  Serial.print(F("{\"uvFan\":\"unsupportedAction\",\"action\":\""));
  if (action) {
    printEscapedJson(action);
  }
  Serial.println(F("\"}"));
}

void uvFanApplyOutputs(bool uvOn, bool fanOn) {
  // DEBUG: 記錄輸入參數
  Serial.print(F("[UV_DEBUG] Input: uvOn="));
  Serial.print(uvOn ? F("true") : F("false"));
  Serial.print(F(", fanOn="));
  Serial.println(fanOn ? F("true") : F("false"));

  const bool lampLevelHigh = UV_LAMP_ACTIVE_HIGH ? uvOn : !uvOn;
  const bool fanLevelHigh = UV_FAN_ACTIVE_HIGH ? fanOn : !fanOn;

  // DEBUG: 記錄計算的電平
  Serial.print(F("[UV_DEBUG] Computed levels: lampLevelHigh="));
  Serial.print(lampLevelHigh ? F("HIGH") : F("LOW"));
  Serial.print(F(", fanLevelHigh="));
  Serial.println(fanLevelHigh ? F("HIGH") : F("LOW"));

  digitalWrite(UV_LAMP_PIN, lampLevelHigh ? HIGH : LOW);
  digitalWrite(UV_FAN_PIN, fanLevelHigh ? HIGH : LOW);

  // DEBUG: 記錄 Pin 寫入
  Serial.print(F("[UV_DEBUG] Pin write: Pin "));
  Serial.print(UV_LAMP_PIN);
  Serial.print(F(" -> "));
  Serial.print(lampLevelHigh ? F("HIGH") : F("LOW"));
  Serial.print(F(", Pin "));
  Serial.print(UV_FAN_PIN);
  Serial.print(F(" -> "));
  Serial.println(fanLevelHigh ? F("HIGH") : F("LOW"));

  const bool lampPinHigh = digitalRead(UV_LAMP_PIN) == HIGH;
  const bool fanPinHigh = digitalRead(UV_FAN_PIN) == HIGH;

  // DEBUG: 記錄回讀值
  Serial.print(F("[UV_DEBUG] Pin readback: Pin "));
  Serial.print(UV_LAMP_PIN);
  Serial.print(F(" reads "));
  Serial.print(lampPinHigh ? F("HIGH") : F("LOW"));
  Serial.print(F(", Pin "));
  Serial.print(UV_FAN_PIN);
  Serial.print(F(" reads "));
  Serial.println(fanPinHigh ? F("HIGH") : F("LOW"));

  uvFanState.uvOn = UV_LAMP_ACTIVE_HIGH ? lampPinHigh : !lampPinHigh;
  uvFanState.fanOn = UV_FAN_ACTIVE_HIGH ? fanPinHigh : !fanPinHigh;

  // DEBUG: 記錄最終狀態
  Serial.print(F("[UV_DEBUG] Final state: uvFanState.uvOn="));
  Serial.print(uvFanState.uvOn ? F("true") : F("false"));
  Serial.print(F(", uvFanState.fanOn="));
  Serial.println(uvFanState.fanOn ? F("true") : F("false"));
  Serial.println(F("[UV_DEBUG] ===== End of uvFanApplyOutputs ====="));
}

void uvFanScheduleNext(unsigned long nowMs, uint32_t nowUnix) {
  if (!uvFanState.autoMode) {
    uvFanState.nextAutoMillis = 0;
    uvFanState.nextAutoUnix = 0;
    return;
  }
  uvFanState.nextAutoMillis = nowMs + UV_CLEAN_INTERVAL_MS;
  uvFanState.nextAutoUnix = nowUnix > 0 ? nowUnix + (UV_CLEAN_INTERVAL_MS / 1000UL) : 0;
}

void uvFanRecordRun(unsigned long nowMs, uint32_t nowUnix) {
  uvFanState.lastRunMillis = nowMs;
  if (nowUnix > 0) {
    uvFanState.lastRunUnix = nowUnix;
  }
  uvFanScheduleNext(nowMs, nowUnix);
}

void uvFanStartCleaning(unsigned long durationMs, unsigned long nowMs, uint32_t nowUnix) {
  const unsigned long bounded = constrain(durationMs == 0 ? UV_CLEAN_DURATION_MS : durationMs, 5000UL, 600000UL);
  uvFanState.cleaningDurationMs = bounded;
  uvFanState.cleaningStartedMs = nowMs;
  uvFanState.cleaningActive = true;
  uvFanState.nextAutoMillis = 0;
  uvFanState.nextAutoUnix = 0;
  uvFanApplyOutputs(true, true);
}

void uvFanStopCleaning(bool recordRun, unsigned long nowMs, uint32_t nowUnix) {
  uvFanState.cleaningActive = false;
  uvFanApplyOutputs(false, false);
  if (recordRun) {
    uvFanRecordRun(nowMs, nowUnix);
  } else if (uvFanState.autoMode) {
    uvFanScheduleNext(nowMs, nowUnix);
  }
}

void uvFanSetAutoMode(bool enabled, unsigned long nowMs, uint32_t nowUnix) {
  uvFanState.autoMode = enabled;
  if (enabled) {
    uvFanScheduleNext(nowMs, nowUnix);
  } else {
    uvFanState.nextAutoMillis = 0;
    uvFanState.nextAutoUnix = 0;
  }
}

void uvFanApplyManualState(bool uvOn, bool fanOn, unsigned long nowMs, uint32_t nowUnix) {
  uvFanState.cleaningActive = false;
  uvFanState.cleaningStartedMs = 0;
  uvFanApplyOutputs(uvOn, fanOn);
  if (uvFanState.autoMode) {
    uvFanScheduleNext(nowMs, nowUnix);
  }
}

void uvFanUpdate(unsigned long nowMs, uint32_t nowUnix) {
  if (uvFanState.cleaningActive) {
    const unsigned long elapsed = nowMs - uvFanState.cleaningStartedMs;
    if (elapsed >= uvFanState.cleaningDurationMs) {
      uvFanStopCleaning(true, nowMs, nowUnix);
    }
    return;
  }

  if (!uvFanState.autoMode) {
    return;
  }

  if (uvFanState.nextAutoMillis == 0) {
    uvFanScheduleNext(nowMs, nowUnix);
    return;
  }

  if (nowMs >= uvFanState.nextAutoMillis) {
    uvFanStartCleaning(uvFanState.cleaningDurationMs, nowMs, nowUnix);
  }
}
#endif

void processJsonCommand(const String& line) {
  // 🔒 速率限制检查 / Rate limiting check
  unsigned long now = millis();

  // 重置每分钟计数器 / Reset per-minute counter
  if (now - commandCounterResetMillis > 60000UL) {
    recentCommandCount = 0;
    commandCounterResetMillis = now;
  }

  // 检查冷却时间 / Check cooldown period
  if (now - lastCommandMillis < COMMAND_COOLDOWN_MS) {
    Serial.println(F("{\"warning\":\"rateLimitCooldown\",\"message\":\"Command sent too quickly\"}"));
    return;
  }

  // 检查每分钟限制 / Check per-minute limit
  if (recentCommandCount >= MAX_COMMANDS_PER_MINUTE) {
    Serial.println(F("{\"warning\":\"rateLimitExceeded\",\"message\":\"Too many commands per minute\"}"));
    return;
  }

  lastCommandMillis = now;
  recentCommandCount++;

  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    Serial.print(F("{\"warning\":\"badCommand\",\"message\":\""));
    Serial.print(err.c_str());
    Serial.println(F("\"}"));
    return;
  }

  const char* type = doc["type"];
  if (!type) return;

  JsonObject payload = doc["payload"];

  if (strcmp(type, "updateCalibration") == 0 && !payload.isNull()) {
    processCalibrationCommand(payload);
  } else if (strcmp(type, "updateSettings") == 0 && !payload.isNull()) {
    processSettingsCommand(payload);
#if ENABLE_AUDIO
  } else if (strcmp(type, "audioControl") == 0 && !payload.isNull()) {
    processAudioCommand(payload);
#endif
#if ENABLE_UV_FAN
  } else if (strcmp(type, "uvFanControl") == 0 && !payload.isNull()) {
    processUvFanCommand(payload);
#endif
  }
}

void processManualCommand(char cmd) {
  if (cmd == 'z') {
#if ENABLE_HX711
    tareFoodScale(25);
    Serial.print(F("{\"event\":\"tare\",\"foodZeroRaw\":"));
    Serial.print(foodZeroRaw);
    Serial.println(F("}"));
#else
    Serial.println(F("{\"warning\":\"hx711Disabled\",\"command\":\"tare\"}"));
#endif
  } else if (cmd == 'c') {
#if ENABLE_HX711
    if (calibrateFoodScale(foodReferenceWeightGrams, 40)) {
      Serial.print(F("{\"event\":\"calibrate\",\"foodScale\":"));
      Serial.print(foodScale, 6);
      Serial.print(F(",\"reference\":"));
      Serial.print(foodReferenceWeightGrams, 2);
      Serial.println(F("}"));
    } else {
      Serial.println(F("{\"warning\":\"calibrateFailed\",\"reason\":\"insufficientDelta\"}"));
    }
#else
    Serial.println(F("{\"warning\":\"hx711Disabled\",\"command\":\"calibrate\"}"));
#endif
  } else if (cmd == 'f') {
#if ENABLE_HX711
    startSmartFeedingCycle(0, "serial");
#endif
    Serial.println(F("{\"event\":\"feed\",\"status\":\"requested\"}"));
#if !ENABLE_HX711
    Serial.println(F("{\"warning\":\"hx711Disabled\",\"command\":\"feed\"}"));
#endif
  }
}

void handleSerialInput() {
  while (Serial.available()) {
    char c = static_cast<char>(Serial.read());
    serialDebugLogChar(c);
    if (serialBuffer.length() == 0) {
      char cmd = static_cast<char>(tolower(static_cast<unsigned char>(c)));
      if (cmd == 'z' || cmd == 'c' || cmd == 'f') {
        processManualCommand(cmd);
        continue;
      }
    }
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        String line = serialBuffer;
        serialBuffer = "";
        serialBufferLastCharMillis = 0;
        line.trim();
        if (line.length() == 1) {
          char cmd = static_cast<char>(tolower(static_cast<unsigned char>(line.charAt(0))));
          if (cmd == 'z' || cmd == 'c' || cmd == 'f') {
            processManualCommand(cmd);
            continue;
          }
        }
        processJsonCommand(line);
      }
      continue;
    }

    // 🔒 檢查緩衝區長度，防止溢位攻擊 / Guard buffer length to prevent overflow
    if (serialBuffer.length() < MAX_SERIAL_BUFFER_SIZE) {
      serialBuffer += c;
      serialBufferLastCharMillis = millis();
    } else {
      serialBuffer = "";
      serialBufferLastCharMillis = 0;
      Serial.println(F("{\"warning\":\"bufferOverflow\",\"message\":\"Serial buffer limit exceeded\"}"));
    }
  }

  if (serialBuffer.length() > 0 && serialBufferLastCharMillis > 0) {
    const unsigned long idle = millis() - serialBufferLastCharMillis;
    if (idle >= SERIAL_BUFFER_IDLE_FLUSH_MS) {
      size_t trimmedLen = serialBuffer.length();
      while (trimmedLen > 0) {
        char tail = serialBuffer[trimmedLen - 1];
        if (tail == ' ' || tail == '\t' || tail == '\r') {
          trimmedLen--;
          continue;
        }
        break;
      }
      bool looksComplete = trimmedLen > 0 && (serialBuffer[trimmedLen - 1] == '}' || serialBuffer[trimmedLen - 1] == ']');
      if (!looksComplete) {
        return;
      }
      processJsonCommand(serialBuffer);
      serialBuffer = "";
      serialBufferLastCharMillis = 0;
    }
  }
}

void echoISR() {
  if (digitalRead(echoPin) == HIGH) {
    pulseStartMicros = micros();
  } else {
    pulseEndMicros = micros();
    pulseReady = true;
  }
}

#if ENABLE_ESP8266
void esp8266FlushInput() {
  while (esp8266.available()) {
    esp8266.read();
  }
}

void esp8266SwitchBaud(unsigned long baud) {
  if (esp8266CurrentBaud == baud) {
    esp8266FlushInput();
    return;
  }

  if (esp8266CurrentBaud != 0) {
    esp8266.end();
  }
  esp8266.begin(baud);
#if !ESP8266_USE_HARDWARE_SERIAL
  esp8266.listen();
#endif
  delay(200);
  esp8266FlushInput();
  esp8266CurrentBaud = baud;
}

bool esp8266BeginAndPing(unsigned long baud) {
  esp8266SwitchBaud(baud);
  return esp8266SendCommand(String(F("AT")), "OK", nullptr, 1000);
}

bool esp8266InitModule() {
  if (esp8266BeginAndPing(ESP8266_BAUD_PRIMARY)) {
    WiFi.init(&esp8266);
    Serial.println(F("{\"esp8266\":\"baud\",\"value\":115200}"));
    return true;
  }

  if (!esp8266BeginAndPing(ESP8266_BAUD_FALLBACK)) {
    Serial.println(F("{\"warning\":\"esp8266InitFailed\",\"reason\":\"noResponse\"}"));
    return false;
  }

  bool updated = esp8266SendCommand(String(F("AT+UART_DEF=115200,8,1,0,0")), "OK", nullptr, 2000);
  if (!updated) {
    Serial.println(F("{\"warning\":\"esp8266InitFailed\",\"reason\":\"uartDef\"}"));
    return false;
  }

  esp8266SendCommand(String(F("AT+RST")), "ready", "OK", 5000);
  delay(2000);
  esp8266FlushInput();

  if (esp8266BeginAndPing(ESP8266_BAUD_PRIMARY)) {
    WiFi.init(&esp8266);
    Serial.println(F("{\"esp8266\":\"baudAdjusted\",\"from\":9600,\"to\":115200}"));
    return true;
  }

  Serial.println(F("{\"warning\":\"esp8266InitFailed\",\"reason\":\"postAdjust\"}"));
  return false;
}

const char* esp8266DescribeCwJapError(int code) {
  switch (code) {
    case 1: return "connectionTimeout";
    case 2: return "wrongPassword";
    case 3: return "apNotFound";
    case 4: return "connectionFailed";
    case 5: return "notConnected";
    case 6: return "apTimeout";
    case 7: return "apWrongPassword";
    default: return "unknown";
  }
}

bool esp8266HttpRequest(const char* method, const String& path, const String& body, const char* contentType, int& statusCode, String& responseBody, String* rawResponseOut) {
  statusCode = 0;
  responseBody = "";

  if (!wifiConnected && !esp8266EnsureWifi()) {
    return false;
  }

  esp8266SendCommand(F("AT+CIPCLOSE"), "OK", "ERROR", 1000);
  delay(200);  // 🔧 增加延迟以确保连接完全关闭 / Increase delay to ensure connection is fully closed

  char startCmd[64];
  snprintf(startCmd, sizeof(startCmd), "AT+CIPSTART=\"TCP\",\"%s\",%u", BACKEND_HOST, BACKEND_PORT);
  bool started = esp8266SendCommand(String(startCmd), "OK", "ALREADY CONNECTED", 10000);
  if (!started) {
    Serial.println(F("{\"error\":\"tcpConnectFailed\"}"));
    esp8266SendCommand(F("AT+CIPCLOSE"), "OK", nullptr, 1000);
    return false;
  }

  String request;
  request.reserve(body.length() + 256);
  request += method;
  request += ' ';
  request += path;
  request += F(" HTTP/1.1\r\nHost: ");
  request += BACKEND_HOST;
  request += F("\r\nUser-Agent: SmartCatBridge/");
  request += F(FIRMWARE_VERSION);
  request += F("\r\nConnection: close");
  if (contentType && *contentType) {
    request += F("\r\nContent-Type: ");
    request += contentType;
  }
  if (strlen(BACKEND_API_KEY) > 0) {
    request += F("\r\nAuthorization: Bearer ");
    request += BACKEND_API_KEY;
  }
  if (body.length() > 0) {
    request += F("\r\nContent-Length: ");
    request += body.length();
  }
  request += F("\r\n\r\n");
  request += body;

  String sendCmd = String(F("AT+CIPSEND=")) + request.length();
  // 🔧 增加超时时间以处理 ESP8266 缓冲区延迟 / Increase timeout to handle ESP8266 buffer delays
  if (!esp8266SendCommand(sendCmd, ">", nullptr, 5000)) {
    Serial.println(F("{\"error\":\"cipsendFailed\"}"));
    esp8266SendCommand(F("AT+CIPCLOSE"), "OK", nullptr, 1000);
    return false;
  }

  esp8266.print(request);
  // 🔧 增加 SEND OK 等待时间以处理大数据包 / Increase SEND OK timeout for large payloads
  bool sendOk = esp8266WaitFor("SEND OK", nullptr, 15000);

  // Capture entire response (all +IPD segments) until CLOSED token or extended idle
  String rawResponse;
  const unsigned long RESPONSE_IDLE_TIMEOUT_MS = 2500;
  const unsigned long RESPONSE_MAX_DURATION_MS = 9000;
  unsigned long lastByte = millis();
  unsigned long overallStart = lastByte;
  bool sawClosedToken = false;
  while ((millis() - overallStart) < RESPONSE_MAX_DURATION_MS) {
    bool dataRead = false;
    while (esp8266.available()) {
      char c = esp8266.read();
      lastByte = millis();
      dataRead = true;
      if (rawResponse.length() < ESP8266_HTTP_RESPONSE_MAX) {
        rawResponse += c;
      }
      const size_t len = rawResponse.length();
      if (len >= 6 &&
          rawResponse.charAt(len - 1) == 'D' &&
          rawResponse.charAt(len - 2) == 'E' &&
          rawResponse.charAt(len - 3) == 'S' &&
          rawResponse.charAt(len - 4) == 'O' &&
          rawResponse.charAt(len - 5) == 'L' &&
          rawResponse.charAt(len - 6) == 'C') {
        sawClosedToken = true;
        break;
      }
    }
    if (sawClosedToken) {
      break;
    }
    if (!dataRead && (millis() - lastByte) > RESPONSE_IDLE_TIMEOUT_MS) {
      break;
    }
  }

  esp8266SendCommand(F("AT+CIPCLOSE"), "OK", "ERROR", 1000, false);
  while (esp8266.available()) {
    esp8266.read();
  }

  if (rawResponseOut) {
    *rawResponseOut = rawResponse;
  }

  if (!sendOk && rawResponse.length() == 0) {
    Serial.println(F("{\"error\":\"httpNoResponse\"}"));
    return false;
  }

  String sanitizedRaw = stripIpdPrefixes(rawResponse);
  String directJson = extractJsonPayload(sanitizedRaw);
  String httpPayload = sanitizedRaw;
  while (httpPayload.length() > 0 && (httpPayload.charAt(0) == '\r' || httpPayload.charAt(0) == '\n')) {
    httpPayload.remove(0, 1);
  }
  int ipdIndex = httpPayload.indexOf("+IPD,");
  if (ipdIndex >= 0) {
    int dataStart = httpPayload.indexOf(':', ipdIndex);
    if (dataStart >= 0 && dataStart + 1 < httpPayload.length()) {
      httpPayload = httpPayload.substring(dataStart + 1);
    }
  }
  int httpIndex = httpPayload.indexOf("HTTP/1.");
  if (httpIndex < 0) {
    httpIndex = httpPayload.indexOf("HTTP/");
  }
  if (httpIndex >= 0) {
    httpPayload = httpPayload.substring(httpIndex);
  }

  int headerEnd = httpPayload.indexOf("\r\n\r\n");
  int delimiterLen = 4;
  if (headerEnd < 0) {
    headerEnd = httpPayload.indexOf("\n\n");
    delimiterLen = 2;
  }
  String headerSection = headerEnd >= 0 ? httpPayload.substring(0, headerEnd) : httpPayload;
  if (headerSection.startsWith("HTTP/1.")) {
    statusCode = headerSection.substring(9, 12).toInt();
  }
  int contentLength = -1;
  int clIndex = headerSection.indexOf("Content-Length:");
  if (clIndex >= 0) {
    clIndex += 15;
    while (clIndex < headerSection.length()) {
      char c = headerSection.charAt(clIndex);
      if (c == ' ' || c == '\t') {
        clIndex++;
      } else {
        break;
      }
    }
    int lineEnd = headerSection.indexOf('\n', clIndex);
    if (lineEnd < 0) {
      lineEnd = headerSection.length();
    }
    String lengthStr = headerSection.substring(clIndex, lineEnd);
    lengthStr.trim();
    long parsedLength = lengthStr.toInt();
    if (parsedLength >= 0 && parsedLength <= static_cast<long>(ESP8266_HTTP_RESPONSE_MAX)) {
      contentLength = static_cast<int>(parsedLength);
    }
  }

  String bodyCandidate;
  if (headerEnd >= 0 && headerEnd + delimiterLen < httpPayload.length()) {
    bodyCandidate = httpPayload.substring(headerEnd + delimiterLen);
  } else {
    bodyCandidate = httpPayload;
  }
  while (bodyCandidate.length() > 0 && (bodyCandidate.charAt(0) == '\r' || bodyCandidate.charAt(0) == '\n')) {
    bodyCandidate.remove(0, 1);
  }

  String rawBodyView;
  if (contentLength > 0) {
    int rawHttpIndex = rawResponse.indexOf("HTTP/1.");
    if (rawHttpIndex < 0) {
      rawHttpIndex = rawResponse.indexOf("HTTP/");
    }
    if (rawHttpIndex >= 0) {
      int rawHeaderEnd = rawResponse.indexOf("\r\n\r\n", rawHttpIndex);
      int rawDelimiter = 4;
      if (rawHeaderEnd < 0) {
        rawHeaderEnd = rawResponse.indexOf("\n\n", rawHttpIndex);
        rawDelimiter = 2;
      }
      if (rawHeaderEnd >= 0) {
        rawBodyView = rawResponse.substring(rawHeaderEnd + rawDelimiter);
        while (rawBodyView.length() > 0 && (rawBodyView.charAt(0) == '\r' || rawBodyView.charAt(0) == '\n')) {
          rawBodyView.remove(0, 1);
        }
        if (rawBodyView.length() >= static_cast<unsigned int>(contentLength)) {
          rawBodyView = rawBodyView.substring(0, contentLength);
        }
      }
    }
  }

  String bodyView = rawBodyView.length() > 0 ? rawBodyView : bodyCandidate;
  int closedPos = bodyView.lastIndexOf("CLOSED");
  if (closedPos >= 0) {
    bodyView = bodyView.substring(0, closedPos);
  }
  String jsonPayload = extractJsonPayload(bodyView);
  if (jsonPayload.length() == 0 && rawBodyView.length() > 0) {
    jsonPayload = extractJsonPayload(rawBodyView);
  }
  if (jsonPayload.length() == 0) {
    jsonPayload = extractJsonPayload(bodyCandidate);
  }
  if (directJson.length() > 0) {
    Serial.print(F("{\"http\":\"jsonExtract\",\"source\":\"raw\",\"length\":"));
    Serial.print(directJson.length());
    Serial.println(F("}"));
    responseBody = directJson;
  } else if (jsonPayload.length() > 0) {
    responseBody = jsonPayload;
  } else if (contentLength >= 0 && bodyView.length() >= static_cast<unsigned int>(contentLength)) {
    responseBody = bodyView.substring(0, contentLength);
  } else if (contentLength >= 0 && bodyCandidate.length() >= static_cast<unsigned int>(contentLength)) {
    responseBody = bodyCandidate.substring(0, contentLength);
  } else {
    responseBody = bodyView.length() > 0 ? bodyView : bodyCandidate;
  }

  int tailIndex = responseBody.lastIndexOf("\r\n");
  if (tailIndex >= 0) {
    String tail = responseBody.substring(tailIndex + 2);
    if (tail == "OK" || tail == "ERROR") {
      responseBody = responseBody.substring(0, tailIndex);
    }
  }

  responseBody.trim();

  if (statusCode == 401) {
    wifiConnected = false;
  }

  if (statusCode == 0 && responseBody.length() > 0) {
    statusCode = 200;
  }
  if (statusCode == 0 && rawResponseOut) {
    const String& rawRef = *rawResponseOut;
    int httpIdx = rawRef.indexOf("HTTP/");
    if (httpIdx >= 0) {
      int firstSpace = rawRef.indexOf(' ', httpIdx);
      if (firstSpace >= 0) {
        int codeStart = firstSpace + 1;
        while (codeStart < rawRef.length() && rawRef[codeStart] == ' ') {
          codeStart++;
        }
        int codeEnd = codeStart;
        while (codeEnd < rawRef.length() && isDigit(static_cast<unsigned char>(rawRef[codeEnd]))) {
          codeEnd++;
        }
        if (codeEnd > codeStart) {
          statusCode = rawRef.substring(codeStart, codeEnd).toInt();
        }
      }
    }
  }
  if (statusCode == 0 && rawResponseOut) {
    Serial.print(F("{\"http\":\"raw\",\"data\":\""));
    printEscapedJson(rawResponseOut->c_str());
    Serial.println(F("\"}"));
  }

  Serial.print(F("{\"http\":\"status\",\"code\":"));
  Serial.print(statusCode);
  Serial.println(F("}"));

  return true;
}

// 🔒 改进版：使用固定缓冲区避免内存碎片 / Improved: use fixed buffer to avoid memory fragmentation
bool esp8266WaitFor(const char* token, const char* altToken, unsigned long timeoutMs) {
  constexpr size_t BUFFER_SIZE = 256;  // 固定缓冲区 / Fixed buffer
  char buffer[BUFFER_SIZE + 1];        // +1 for null terminator
  size_t bufferLen = 0;

  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    while (esp8266.available()) {
      char c = esp8266.read();

      // 🔒 添加字符到缓冲区，防止溢出 / Add character to buffer, prevent overflow
      if (bufferLen < BUFFER_SIZE) {
        buffer[bufferLen++] = c;
        buffer[bufferLen] = '\0';  // 保持 null-terminated
      } else {
        // 缓冲区满时，移除前半部分（滑动窗口）
        // When buffer full, remove first half (sliding window)
        const size_t keepSize = BUFFER_SIZE / 2;
        memmove(buffer, buffer + keepSize, keepSize);
        bufferLen = keepSize;
        buffer[bufferLen++] = c;
        buffer[bufferLen] = '\0';
      }

      // 🔒 检查是否包含关键字 / Check if contains keywords
      if ((token && strstr(buffer, token) != nullptr) ||
          (altToken && strstr(buffer, altToken) != nullptr)) {
        Serial.print(F("{\"esp8266\":\"response\",\"data\":\""));
        printEscapedJson(buffer);  // 🔒 修复：使用转义函数 / Fix: Use escape function
        Serial.println(F("\"}"));
        return true;
      }
      const char* cwJap = strstr(buffer, "+CWJAP:");
      if (cwJap != nullptr) {
        int code = atoi(cwJap + 7);
        Serial.print(F("{\"esp8266\":\"cwJap\",\"code\":"));
        Serial.print(code);
        Serial.print(F(",\"reason\":\""));
        Serial.print(esp8266DescribeCwJapError(code));
        Serial.println(F("\"}"));
      }
      if (strstr(buffer, "ERROR") != nullptr || strstr(buffer, "FAIL") != nullptr) {
        Serial.print(F("{\"esp8266\":\"error\",\"data\":\""));
        printEscapedJson(buffer);  // 🔒 修复：使用转义函数 / Fix: Use escape function
        Serial.println(F("\"}"));
        return false;
      }
    }
  }

  // 超时 / Timeout
  Serial.print(F("{\"esp8266\":\"timeout\",\"data\":\""));
  printEscapedJson(buffer);  // 🔒 修复：使用转义函数 / Fix: Use escape function
  Serial.println(F("\"}"));
  return false;
}

bool esp8266SendCommand(const String& command, const char* token, const char* altToken, unsigned long timeoutMs, bool flushBeforeSend) {
  if (flushBeforeSend) {
    esp8266FlushInput();
  }
  esp8266.print(command);
  esp8266.print(F("\r\n"));
  return esp8266WaitFor(token, altToken, timeoutMs);
}

bool esp8266EnsureWifi() {
  const unsigned long now = millis();
  if (wifiConnected && (now - lastWifiAttempt) < 60000UL) {
    return true;
  }
  lastWifiAttempt = now;

  if (!esp8266SendCommand(F("AT"), "OK", nullptr, 1000)) {
    esp8266Ready = false;
    return false;
  }
  esp8266Ready = true;

  // 🔒 修复：正确配置 ESP8266 为客户端模式
  // Fix: Properly configure ESP8266 for client mode
  esp8266SendCommand(F("AT+CWMODE=1"), "OK", "no change", 1000);  // Station mode (client)

  // 若曾啟用 Server 模式，模組會要求先關閉後才能切換單連線模式
  esp8266SendCommand(F("AT+CIPSERVER=0"), "OK", "no change", 1500);
  bool cipmuxOk = esp8266SendCommand(F("AT+CIPMUX=0"), "OK", "no change", 1500);  // Single connection mode
  if (!cipmuxOk) {
    // 某些韌體會回傳 ERROR；再嘗試一次並紀錄錯誤方便除錯
    esp8266SendCommand(F("AT+CIPSERVER=0"), "OK", "no change", 1500);
    cipmuxOk = esp8266SendCommand(F("AT+CIPMUX=0"), "OK", "no change", 1500);
  }
  if (!cipmuxOk) {
    Serial.println(F("{\"wifi\":\"cipmuxError\",\"message\":\"Unable to switch to single connection mode\"}"));
    return false;
  }

  // 🔒 修复：确保没有遗留的连接
  // Fix: Ensure no leftover connections
  esp8266SendCommand(F("AT+CIPCLOSE"), "OK", "ERROR", 1000);
  delay(100);

  String joinCmd = String(F("AT+CWJAP=\"")) + WIFI_SSID + F("\",\"") + WIFI_PASSWORD + F("\"");

  // 🆕 指數退避重試機制 (Exponential backoff retry)
  const int MAX_RETRIES = 3;
  const unsigned long RETRY_DELAYS[] = {1000, 2000, 4000}; // 1s, 2s, 4s
  bool joined = false;

  for (int attempt = 0; attempt < MAX_RETRIES && !joined; attempt++) {
    if (attempt > 0) {
      Serial.print(F("{\"wifi\":\"retry\",\"attempt\":"));
      Serial.print(attempt + 1);
      Serial.print(F(",\"delay\":"));
      Serial.print(RETRY_DELAYS[attempt - 1]);
      Serial.println(F("}"));
      delay(RETRY_DELAYS[attempt - 1]);
    }

    joined = esp8266SendCommand(joinCmd, "OK", "ALREADY CONNECTED", 20000);

    if (!joined && attempt < MAX_RETRIES - 1) {
      Serial.print(F("{\"wifi\":\"attemptFailed\",\"attempt\":"));
      Serial.print(attempt + 1);
      Serial.println(F("}"));
    }
  }

  wifiConnected = joined;

  if (wifiConnected) {
    Serial.println(F("{\"wifi\":\"connected\"}"));

    // 🔒 诊断：获取 ESP8266 的 IP 地址和网关信息
    // Diagnostics: Get ESP8266's IP address and gateway info
    delay(500);
    esp8266FlushInput();
    esp8266.println(F("AT+CIFSR"));
    delay(1000);

    Serial.print(F("{\"esp8266\":\"networkInfo\",\"data\":\""));
    while (esp8266.available()) {
      char c = esp8266.read();
      if (c == '\n') Serial.print(F("\\n"));
      else if (c == '\r') Serial.print(F("\\r"));
      else if (c >= 32 && c <= 126) Serial.print(c);
    }
    Serial.println(F("\"}"));

    // 🔒 诊断：检查网关是否可达（ping 默认网关）
    // Diagnostics: Check if gateway is reachable
    Serial.println(F("{\"debug\":\"checkingGateway\"}"));
    delay(200);

    // 尝试简单的 AT 命令确保 ESP8266 响应正常
    // Try simple AT command to ensure ESP8266 is responding
    if (!esp8266SendCommand(F("AT"), "OK", nullptr, 1000)) {
      Serial.println(F("{\"warning\":\"esp8266NotResponding\",\"message\":\"ESP8266 not responding to AT commands after WiFi connect\"}"));
    }

  } else {
    Serial.println(F("{\"wifi\":\"connectFailed\"}"));
  }
  return wifiConnected;
}

bool esp8266PostJson(const String& payload, String* responseOut) {
  int statusCode = 0;
  String responseBody;
  if (responseOut) {
    *responseOut = "";
  }
  if (!esp8266HttpRequest("POST", String(BACKEND_PATH), payload, "application/json", statusCode, responseBody)) {
    return false;
  }

  if (responseOut) {
    *responseOut = responseBody;
  }

  if (statusCode >= 200 && statusCode < 300) {
    Serial.println(F("{\"success\":\"dataSent\"}"));
    return true;
  }

  Serial.print(F("{\"error\":\"httpError\",\"code\":"));
  Serial.print(statusCode);
  Serial.println(F("}"));
  return false;
}

#endif  // ENABLE_ESP8266

static bool handleHardwareCommand(const char* type, JsonObject commandPayload, String& message) {
  if (strcmp(type, "updateSettings") == 0) {
    if (commandPayload.isNull()) {
      message = F("payload-missing");
      return false;
    }
    processSettingsCommand(commandPayload);
    message = F("settings-applied");
    return true;
  }

  if (strcmp(type, "updateCalibration") == 0) {
    if (commandPayload.isNull()) {
      message = F("payload-missing");
      return false;
    }
    processCalibrationCommand(commandPayload);
    message = F("calibration-applied");
    return true;
  }

#if ENABLE_HX711
  if (strcmp(type, "triggerFeed") == 0 || strcmp(type, "feedNow") == 0 || strcmp(type, "startFeederCycle") == 0) {
    float targetOverride = 0.0f;
    float minOverride = 0.0f;
    if (!commandPayload.isNull()) {
      if (commandPayload.containsKey("targetGrams")) {
        targetOverride = commandPayload["targetGrams"].as<float>();
      }
      if (commandPayload.containsKey("minGrams")) {
        minOverride = commandPayload["minGrams"].as<float>();
      }
    }
    uint32_t nowUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      nowUnix = rtc.now().unixtime();
    }
#endif
    if (startSmartFeedingCycle(nowUnix, "command", targetOverride, minOverride)) {
      message = F("feeding-started");
      return true;
    }
    message = F("feeding-skipped");
    return false;
  }

  if (strcmp(type, "stopFeederCycle") == 0 || strcmp(type, "stopFeed") == 0) {
    stopSmartFeedingCycle("command");
    message = F("feeding-stopped");
    return true;
  }

  if (strcmp(type, "tareFoodScale") == 0) {
    tareFoodScale(25);
    message = F("tare-complete");
    return true;
  }

  if (strcmp(type, "calibrateFoodScale") == 0) {
    float reference = foodReferenceWeightGrams;
    if (!commandPayload.isNull() && commandPayload.containsKey("referenceGrams")) {
      reference = commandPayload["referenceGrams"].as<float>();
      if (reference > 0.0f) {
        foodReferenceWeightGrams = reference;
      }
    }
    if (calibrateFoodScale(reference, 40)) {
      message = F("calibration-applied");
      return true;
    }
    message = F("calibration-failed");
    return false;
  }
#endif

#if ENABLE_HYDRATION
  if (strcmp(type, "hydrateNow") == 0 || strcmp(type, "waterPump") == 0) {
    unsigned long duration = 1000UL;
    if (!commandPayload.isNull() && commandPayload.containsKey("durationMs")) {
      duration = commandPayload["durationMs"].as<unsigned long>();
    }
    uint32_t nowUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      nowUnix = rtc.now().unixtime();
    }
#endif
    runHydrationBurst("command", nowUnix, duration);
    message = F("hydration-started");
    return true;
  }
#endif

#if ENABLE_AUDIO
  if (strcmp(type, "playAudioPattern") == 0) {
    if (!audioModuleReady) {
      message = F("audio-unavailable");
      return false;
    }
    const char* patternRaw = commandPayload.containsKey("pattern") ? commandPayload["pattern"].as<const char*>() : nullptr;
    const char* patternName = (patternRaw && strlen(patternRaw) > 0) ? patternRaw : "call-cat";
    uint8_t repeat = commandPayload.containsKey("repeat") ? commandPayload["repeat"].as<uint8_t>() : 1;
    if (commandPayload.containsKey("muted") && commandPayload["muted"].as<bool>()) {
      audioSetMute(true);
      message = F("audio-muted");
      return true;
    }
    audioPlayPattern(audioPatternFromString(patternName), repeat);
    message = F("audio-playing");
    return true;
  }

  if (strcmp(type, "stopAudio") == 0) {
    if (!audioModuleReady) {
      message = F("audio-unavailable");
      return false;
    }
    audioStopPlayback();
    message = F("audio-stopped");
    return true;
  }

  if (strcmp(type, "setAudioState") == 0) {
    if (!audioModuleReady) {
      message = F("audio-unavailable");
      return false;
    }
    if (!commandPayload.isNull()) {
      if (commandPayload.containsKey("muted")) {
        audioSetMute(commandPayload["muted"].as<bool>());
      }
      if (commandPayload.containsKey("volumePercent")) {
        int volume = commandPayload["volumePercent"].as<int>();
        if (volume >= 0) {
          audioSetVolume(static_cast<uint8_t>(volume));
        }
      }
      if (commandPayload.containsKey("pattern")) {
        const char* patternName = commandPayload["pattern"].as<const char*>();
        if (patternName && !audioMuted) {
          uint8_t repeat = commandPayload.containsKey("repeat") ? commandPayload["repeat"].as<uint8_t>() : 1;
          audioPlayPattern(audioPatternFromString(patternName), repeat);
        }
      }
    }
    message = F("audio-updated");
    return true;
  }
#endif

#if ENABLE_UV_FAN
  if (strcmp(type, "setUvFanState") == 0) {
    // DEBUG: 記錄處理 setUvFanState 命令
    Serial.println(F("[CMD_DEBUG] Handling setUvFanState command"));

    unsigned long nowMs = millis();
    uint32_t nowUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      nowUnix = rtc.now().unixtime();
    }
#endif
    bool updated = false;
    if (!commandPayload.isNull()) {
      const bool hasUv = commandPayload.containsKey("uvOn");
      const bool hasFan = commandPayload.containsKey("fanOn");

      // DEBUG: 記錄參數
      Serial.print(F("[CMD_DEBUG] hasUv="));
      Serial.print(hasUv ? F("true") : F("false"));
      Serial.print(F(", hasFan="));
      Serial.println(hasFan ? F("true") : F("false"));

      if (hasUv || hasFan) {
        bool nextUv = hasUv ? commandPayload["uvOn"].as<bool>() : uvFanState.uvOn;
        bool nextFan = hasFan ? commandPayload["fanOn"].as<bool>() : uvFanState.fanOn;

        // DEBUG: 記錄將要設定的狀態
        Serial.print(F("[CMD_DEBUG] Will set: nextUv="));
        Serial.print(nextUv ? F("true") : F("false"));
        Serial.print(F(", nextFan="));
        Serial.println(nextFan ? F("true") : F("false"));

        uvFanApplyManualState(nextUv, nextFan, nowMs, nowUnix);
        updated = true;
      }
      if (commandPayload.containsKey("autoMode")) {
        uvFanSetAutoMode(commandPayload["autoMode"].as<bool>(), nowMs, nowUnix);
        updated = true;
      }
    }
    if (!updated) {
      message = F("payload-missing");
      return false;
    }
    message = F("uvfan-state-updated");
    return true;
  }

  if (strcmp(type, "startUvCleaning") == 0) {
    unsigned long duration = commandPayload.containsKey("durationMs")
      ? commandPayload["durationMs"].as<unsigned long>()
      : UV_CLEAN_DURATION_MS;
    unsigned long nowMs = millis();
    uint32_t nowUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      nowUnix = rtc.now().unixtime();
    }
#endif
    uvFanStartCleaning(duration, nowMs, nowUnix);
    message = F("uvfan-cleaning-started");
    return true;
  }

  if (strcmp(type, "stopUvCleaning") == 0) {
    unsigned long nowMs = millis();
    uint32_t nowUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      nowUnix = rtc.now().unixtime();
    }
#endif
    uvFanStopCleaning(false, nowMs, nowUnix);
    message = F("uvfan-cleaning-stopped");
    return true;
  }
#endif

  message = F("unsupported-command");
  return false;
}

#if ENABLE_ESP8266
bool processHardwareCommandEnvelope(JsonObject data) {
  if (data.isNull()) {
    Serial.println(F("{\"hardwareCommand\":\"missingData\"}"));
    return false;
  }

  int commandId = data["id"].as<int>();
  const char* type = data["type"].as<const char*>();

  // DEBUG: 記錄收到的命令
  Serial.print(F("[CMD_DEBUG] Received command: id="));
  Serial.print(commandId);
  Serial.print(F(", type=\""));
  if (type) {
    Serial.print(type);
  } else {
    Serial.print(F("null"));
  }
  Serial.println(F("\""));

  if (commandId <= 0 || !type) {
    Serial.println(F("{\"hardwareCommand\":\"invalidCommand\"}"));
    return false;
  }

  JsonObject payload = data["payload"].is<JsonObject>() ? data["payload"].as<JsonObject>() : JsonObject();

  // DEBUG: 記錄 payload 內容
  Serial.print(F("[CMD_DEBUG] Payload: "));
  serializeJson(payload, Serial);
  Serial.println();

  String message;
  bool success = handleHardwareCommand(type, payload, message);

  // DEBUG: 記錄執行結果
  Serial.print(F("[CMD_DEBUG] Command executed: success="));
  Serial.print(success ? F("true") : F("false"));
  if (message.length() > 0) {
    Serial.print(F(", message=\""));
    Serial.print(message);
    Serial.print(F("\""));
  }
  Serial.println();
  enqueueHardwareCommandResult(commandId, success, message);

#if ENABLE_AUDIO
  // 🎵 立即启动音频播放，不要等待ACK发送完成
  // Start audio playback immediately, don't wait for ACK to complete
  if (audioModuleReady) {
    audioUpdate();
  }
#endif

  bool ackSent = false;
  for (uint8_t attempt = 0; attempt < 3 && !ackSent; ++attempt) {
    if (attempt > 0) {
      delay(200);
    }
    ackSent = sendHardwareCommandAck(commandId, success, message);
  }

  if (!ackSent) {
    Serial.print(F("{\"hardwareCommand\":\"ackFailed\",\"id\":"));
    Serial.print(commandId);
    Serial.println(F("}"));
  } else {
    clearHardwareCommandResult(commandId);
    Serial.print(F("{\"hardwareCommand\":\"ack\",\"id\":"));
    Serial.print(commandId);
    Serial.print(F(",\"status\":\""));
    Serial.print(success ? F("success") : F("error"));
    Serial.println(F("\"}"));
  }
  return success;
}
#endif

bool sendHardwareCommandAck(int commandId, bool success, const String& message) {
  StaticJsonDocument<160> doc;
  doc["status"] = success ? "success" : "error";
  if (message.length() > 0) {
    doc["message"] = message;
  }

  String body;
  serializeJson(doc, body);
  String path = String(F("/api/hardware/commands/")) + commandId + F("/ack");

  int statusCode = 0;
  String responseBody;
  if (!esp8266HttpRequest("POST", path, body, "application/json", statusCode, responseBody)) {
    return false;
  }

  return statusCode >= 200 && statusCode < 300;
}

#if ENABLE_ESP8266
#if ENABLE_ESP8266
void enqueueHardwareCommandResult(int commandId, bool success, const String& message) {
  if (commandId <= 0) {
    return;
  }

  if (pendingHardwareCommandResultCount >= MAX_PENDING_COMMAND_RESULTS) {
    for (uint8_t i = 1; i < MAX_PENDING_COMMAND_RESULTS; ++i) {
      pendingHardwareCommandResults[i - 1] = pendingHardwareCommandResults[i];
    }
    pendingHardwareCommandResultCount = MAX_PENDING_COMMAND_RESULTS - 1;
  }

  HardwareCommandResultEntry& entry = pendingHardwareCommandResults[pendingHardwareCommandResultCount++];
  entry.id = commandId;
  entry.success = success;
  size_t len = message.length();
  if (len >= sizeof(entry.message)) {
    len = sizeof(entry.message) - 1;
  }
  if (len > 0) {
    memcpy(entry.message, message.c_str(), len);
    entry.message[len] = '\0';
  } else {
    entry.message[0] = '\0';
  }
}

void clearHardwareCommandResult(int commandId) {
  if (commandId <= 0 || pendingHardwareCommandResultCount == 0) {
    return;
  }
  for (uint8_t i = 0; i < pendingHardwareCommandResultCount; ++i) {
    if (pendingHardwareCommandResults[i].id == commandId) {
      for (uint8_t j = i + 1; j < pendingHardwareCommandResultCount; ++j) {
        pendingHardwareCommandResults[j - 1] = pendingHardwareCommandResults[j];
      }
      pendingHardwareCommandResultCount -= 1;
      break;
    }
  }
}
#endif

void pollHardwareCommands() {
  if (!wifiConnected && !esp8266EnsureWifi()) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastCommandPollMillis < COMMAND_POLL_INTERVAL_MS) {
    return;
  }
  lastCommandPollMillis = now;

  // DEBUG: 記錄輪詢開始
  Serial.println(F("[CMD_DEBUG] Polling hardware commands..."));

  uint8_t processed = 0;
  while (processed < 3) {
    int statusCode = 0;
    String responseBody;
    String rawResponse;

    // DEBUG: 記錄請求發送
    Serial.println(F("[CMD_DEBUG] Sending GET request to backend..."));

    if (!esp8266HttpRequest("GET", String(HARDWARE_COMMAND_PENDING_PATH), "", nullptr, statusCode, responseBody, &rawResponse)) {
      Serial.println(F("{\"hardwareCommand\":\"pollFailed\"}"));
      break;
    }

    // DEBUG: 記錄 HTTP 狀態碼
    Serial.print(F("[CMD_DEBUG] HTTP status: "));
    Serial.println(statusCode);

    if (statusCode == 204) {
      Serial.println(F("[CMD_DEBUG] No pending commands (204)"));
      break;
    }

    if (statusCode != 200) {
      Serial.print(F("{\"hardwareCommand\":\"unexpectedStatus\",\"code\":"));
      Serial.print(statusCode);
      Serial.println(F("}"));
      break;
    }

    String parsedBody = resolveHttpJsonBody(responseBody, rawResponse);
    parsedBody.trim();
    if (parsedBody.length() == 0) {
      Serial.print(F("{\"hardwareCommand\":\"emptyBody\",\"raw\":\""));
      printEscapedJson(rawResponse.c_str());
      Serial.println(F("\"}"));
      break;
    }

    StaticJsonDocument<768> doc;
    DeserializationError err = deserializeJson(doc, parsedBody);
    if (err) {
      Serial.print(F("{\"hardwareCommand\":\"parseError\",\"message\":\""));
      Serial.print(err.c_str());
      Serial.print(F("\",\"raw\":\""));
      printEscapedJson(parsedBody.c_str());
      Serial.println(F("\"}"));
      break;
    }

    JsonObject data = doc["data"].is<JsonObject>() ? doc["data"].as<JsonObject>() : JsonObject();
    if (data.isNull()) {
      Serial.println(F("{\"hardwareCommand\":\"missingData\"}"));
      break;
    }

    (void)processHardwareCommandEnvelope(data);

    processed += 1;
  }
}

void processInlineHardwareCommands(const String& responseBody) {
  if (responseBody.length() == 0) {
    return;
  }

  StaticJsonDocument<64> filter;
  filter["commands"] = true;

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, responseBody, DeserializationOption::Filter(filter));
  if (err) {
    Serial.print(F("{\"hardwareCommand\":\"inlineParseError\",\"message\":\""));
    Serial.print(err.c_str());
    Serial.println(F("\"}"));
    return;
  }

  JsonArray commands = doc["commands"].is<JsonArray>() ? doc["commands"].as<JsonArray>() : JsonArray();
  if (commands.isNull() || commands.size() == 0) {
    return;
  }

  for (JsonObject command : commands) {
    (void)processHardwareCommandEnvelope(command);
  }
}
#endif

// =======================
// Setup
// =======================
void setup() {
  Serial.begin(115200);
  Serial.println(F("{\"firmware\":\"1.1.3-upload\"}"));
  bootLog(F("enterSetup"));
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  attachInterrupt(digitalPinToInterrupt(echoPin), echoISR, CHANGE);

  Wire.begin();
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(2000, true);
#endif
  bootLog(F("afterWireBegin"));

#if ENABLE_OLED
  if (oled.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    oledReady = true;
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0, 0);
    oled.println(F("Smart Cat Bridge"));
    oled.println(F("Firmware v" FIRMWARE_VERSION));
    oled.display();
    bootLog(F("oledReady"));
  } else {
    Serial.println(F("{\"warning\":\"oledInitFailed\"}"));
    bootLog(F("oledInitFailed"));
  }
#endif

#if ENABLE_DS3231
  bootLog(F("rtcInitStart"));
  bool rtcDetected = probeI2cDevice(0x68, 250);
  if (!rtcDetected) {
    rtcReady = false;
    bootLog(F("rtcNotDetected"));
  } else {
    rtcReady = rtc.begin();
    if (rtcReady && rtc.lostPower()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
    bootLog(rtcReady ? F("rtcReady") : F("rtcInitFailed"));
  }
#endif

#if ENABLE_ST021
  bootLog(F("st021InitStart"));
  st021Ready = initSt021();
  bootLog(st021Ready ? F("st021Ready") : F("st021NotDetected"));
#endif

  bootLog(F("dhtInitStart"));
  dht.begin();
  bootLog(F("dhtBegin"));

#if ENABLE_AUDIO
  audioInit();
  bootLog(F("audioInit"));
#endif

#if ENABLE_HX711
  pinMode(BTN_TARE_PIN, INPUT_PULLUP);
  pinMode(BTN_RESET_PIN, INPUT_PULLUP);
  pinMode(BTN_CAL_PIN, INPUT_PULLUP);
  pinMode(BTN_FEED_PIN, INPUT_PULLUP);
  tareButtonPrev = digitalRead(BTN_TARE_PIN);
  resetButtonPrev = digitalRead(BTN_RESET_PIN);
  calButtonPrev = digitalRead(BTN_CAL_PIN);
  feedButtonPrev = digitalRead(BTN_FEED_PIN);
  tareButtonLastMs = resetButtonLastMs = calButtonLastMs = feedButtonLastMs = millis();
  foodScaleSensor.begin(HX711_DT_PIN, HX711_SCK_PIN);
  Serial.print(F("🔧 [DEBUG] HX711 initialized on DT="));
  Serial.print(HX711_DT_PIN);
  Serial.print(F(", SCK="));
  Serial.println(HX711_SCK_PIN);

  if (foodScaleSensor.is_ready()) {
    Serial.println(F("✅ [DEBUG] HX711 is ready!"));

    // Test multiple readings
    Serial.println(F("🔧 [DEBUG] Testing Load Cell connection..."));
    for (int i = 0; i < 3; i++) {
      long rawValue = foodScaleSensor.read();
      Serial.print(F("   Reading #"));
      Serial.print(i + 1);
      Serial.print(F(": "));
      Serial.println(rawValue);
      delay(100);
    }

    // Check if readings are valid
    long avgRaw = foodScaleSensor.read_average(5);
    Serial.print(F("🔧 [DEBUG] Average reading (5 samples): "));
    Serial.println(avgRaw);

    if (avgRaw == -1 || avgRaw == 0) {
      Serial.println(F("❌ [DEBUG] Load Cell NOT connected! Check 4 wires (E+, E-, A+, A-)"));
    } else if (avgRaw > 0 && avgRaw < 100) {
      Serial.println(F("⚠️  [DEBUG] Load Cell reading too low - possible connection issue"));
    } else {
      Serial.println(F("✅ [DEBUG] Load Cell connected and working!"));
    }
  } else {
    Serial.println(F("❌ [DEBUG] HX711 NOT ready - check DT/SCK wiring!"));
  }

  ensureServoAttached();
  closeFeederGate();
  tareFoodScale(25);
  applyFeederScheduleString(feederScheduleBuffer);
  bootLog(F("hx711Ready"));
#endif

#if ENABLE_HYDRATION
  pinMode(WATER_PUMP_PIN, OUTPUT);
  digitalWrite(WATER_PUMP_PIN, LOW);
  pinMode(BTN_WATER_PIN, INPUT_PULLUP);
  hydrationState.startupMs = millis();
  readWaterLevel(8);
#endif

#if ENABLE_UV_FAN
  pinMode(UV_LAMP_PIN, OUTPUT);
  pinMode(UV_FAN_PIN, OUTPUT);
  uvFanApplyOutputs(false, false);
  bootLog(F("uvFanPinsReady"));
#endif

#if ENABLE_ESP8266
  // 預先設定與模組的鮑率，後續在初始化成功時才正式交給 WiFiEsp
  esp8266SwitchBaud(ESP_BAUDRATE);
  esp8266Ready = esp8266InitModule();
  if (!esp8266Ready) {
    Serial.println(F("{\"warning\":\"esp8266InitFailed\"}"));
    bootLog(F("esp8266InitFailed"));
  } else {
    wifiConnected = false;
    lastWifiAttempt = 0;
    bootLog(F("esp8266Ready"));
  }
#endif

  markFeedingEvent();
  bootLog(F("feedingEventMarked"));

#if ENABLE_UV_FAN
  {
    uint32_t bootUnix = 0;
#if ENABLE_DS3231
    if (rtcReady) {
      bootUnix = rtc.now().unixtime();
    }
#endif
    uvFanSetAutoMode(uvFanState.autoMode, millis(), bootUnix);
  }
#endif

  StaticJsonDocument<192> readyDoc;
  readyDoc["status"] = "ready";
  readyDoc["version"] = FIRMWARE_VERSION;
  readyDoc["note"] = "Commands: z=tare scale, c=calibrate, f=feed";
#if ENABLE_ST021
  readyDoc["st021"] = st021Ready ? "online" : "notDetected";
#endif
#if ENABLE_DS3231
  readyDoc["rtc"] = rtcReady ? "online" : "offline";
#endif
#if ENABLE_HX711
  readyDoc["feeder"] = "ready";
#endif
#if ENABLE_ESP8266
  readyDoc["wifi"] = "pending";
#endif
#if ENABLE_AUDIO
  readyDoc["audio"] = audioModuleReady ? "ready" : "offline";
#endif
  serializeJson(readyDoc, Serial);
  Serial.println();
  bootLog(F("readyDocSent"));
}

// =======================
// Loop
// =======================
void loop() {
  handleSerialInput();

#if ENABLE_AUDIO
  audioUpdate();
#endif

#if ENABLE_ESP8266
  if (esp8266Ready) {
    pollHardwareCommands();
  }
#endif

  const unsigned long nowMs = millis();
#if ENABLE_ESP8266
  if (esp8266Ready && !wifiConnected && (nowMs - lastWifiAttempt) > 30000UL) {
    esp8266EnsureWifi();
  }
#endif
#if ENABLE_HX711
  handleFeederButtons();
  updateFeederGate();
#endif
  if (nowMs - lastReportMillis < REPORT_INTERVAL_MS) {
    delay(5);
    return;
  }
  lastReportMillis = nowMs;

#if ENABLE_DS3231
  DateTime rtcNow;
  bool hasRtcNow = false;
  uint32_t currentUnix = 0;
  if (rtcReady) {
    rtcNow = rtc.now();
    hasRtcNow = true;
    currentUnix = rtcNow.unixtime();
  }
#else
  bool hasRtcNow = false;
  uint32_t currentUnix = 0;
#endif

#if ENABLE_UV_FAN
  uvFanUpdate(nowMs, currentUnix);
#endif
#if ENABLE_HYDRATION
  handleManualWaterButton(nowMs, currentUnix);
#endif
#if ENABLE_HYDRATION && ENABLE_DS3231
  if (hasRtcNow) {
    processHydrationScheduleTick(rtcNow.hour(), rtcNow.minute(), currentUnix);
  }
#endif
#if ENABLE_HX711 && ENABLE_DS3231
  if (hasRtcNow) {
    processFeederScheduleTick(rtcNow.hour(), rtcNow.minute(), rtcNow.second(), currentUnix);
  }
#endif

  // 🔒 超声波传感器读取带防抖机制 / Ultrasonic sensor reading with debouncing
  float distanceCm = readDistanceCm();

  if (distanceCm <= 0.0f) {
    // 读取失败 / Reading failed
    distanceSensorFailCount++;

    if (distanceSensorFailCount >= DISTANCE_SENSOR_MAX_FAILS) {
      // 连续失败太多次，使用缓存值并警告 / Too many consecutive failures, use cached value and warn
      distanceCm = lastValidDistanceCm;
      if (distanceSensorFailCount == DISTANCE_SENSOR_MAX_FAILS) {
        // 只在第一次达到阈值时警告 / Only warn once when threshold is reached
        Serial.println(F("{\"warning\":\"distanceSensorFail\",\"message\":\"Using cached value\"}"));
      }
    } else {
      // 失败次数未达到阈值，使用上次有效值但不警告 / Failures below threshold, use last valid value without warning
      distanceCm = lastValidDistanceCm;
    }
  } else {
    // 读取成功，重置失败计数器并更新缓存 / Reading successful, reset fail counter and update cache
    if (distanceSensorFailCount >= DISTANCE_SENSOR_MAX_FAILS) {
      // 从故障中恢复 / Recovered from failure
      Serial.println(F("{\"info\":\"distanceSensorRecovered\"}"));
    }
    distanceSensorFailCount = 0;
    lastValidDistanceCm = distanceCm;
  }

  float waterLevelPercent = computeWaterLevelPercent(distanceCm);

  int ldrAdc = sampleAnalogAvg(ldrPin, 5, 2);
  float ambientPercent = computeAmbientPercent(ldrAdc);

  float foodWeightGrams = 0.0f;
#if ENABLE_HX711
  foodWeightGrams = readFoodWeightGrams();
#endif
  float catWeightKg = 0.0f;
  bool catPresent = false;

  float temperatureC = dht.readTemperature();
  float humidityPercent = dht.readHumidity();

#if ENABLE_ST021
  const bool hasDhtTemp = !isnan(temperatureC);
  const bool hasDhtHumidity = !isnan(humidityPercent);
  if ((!hasDhtTemp || !hasDhtHumidity) && st021Ready) {
    const float st021Temp = readSt021TemperatureC();
    const float st021Humidity = readSt021HumidityPercent();
    if (!hasDhtTemp && !isnan(st021Temp)) {
      temperatureC = st021Temp;
    }
    if (!hasDhtHumidity && !isnan(st021Humidity)) {
      humidityPercent = st021Humidity;
    }
  }
#endif

#if ENABLE_HX711
  const bool feederOpenStatus = feederGateOpen;
#else
  const bool feederOpenStatus = false;
#endif

#if ENABLE_OLED
  oledRenderSummary(temperatureC, humidityPercent, waterLevelPercent, foodWeightGrams, feederOpenStatus);
#endif

  if (isnan(temperatureC)) {
    temperatureC = 0.0f;
  }
  if (isnan(humidityPercent)) {
    humidityPercent = 0.0f;
  }

  if (waterLevelPercent >= 0.0f) {
    if (waterLevelPercent > lastWaterLevelPercent + 3.0f) {
      // Assume refilled
      lastWaterLevelPercent = waterLevelPercent;
      cumulativeWaterIntakeMl = 0.0f;
    } else if (waterLevelPercent < lastWaterLevelPercent - 0.5f) {
      float consumedPercent = lastWaterLevelPercent - waterLevelPercent;
      float consumedMl = (consumedPercent / 100.0f) * waterBowlCapacityMl;
      cumulativeWaterIntakeMl = max(0.0f, cumulativeWaterIntakeMl + consumedMl);
      lastWaterLevelPercent = waterLevelPercent;
    } else {
      lastWaterLevelPercent = waterLevelPercent;
    }
  }

  unsigned long minutesSinceFeeding = 0;
#if ENABLE_DS3231
  if (rtcReady && hasRtcNow && lastFeedingUnix != 0 && rtcNow.unixtime() >= lastFeedingUnix) {
    // 🔒 方法 1：优先使用 RTC 时间戳（最准确）
    // Method 1: Prefer RTC timestamp (most accurate)
    minutesSinceFeeding = (rtcNow.unixtime() - lastFeedingUnix) / 60UL;
  } else
#endif
  {
    // 🔒 修复：简化 millis() 溢出处理（无符号算术自动处理溢出）
    // Fix: Simplified millis() overflow handling (unsigned arithmetic handles overflow automatically)
    unsigned long elapsedMs = nowMs - lastFeedingMillis;

    // 唯一需要检查的是：Arduino 刚重启导致 elapsedMs 异常大
    // Only concern: Arduino just reset, causing abnormally large elapsedMs
    constexpr unsigned long SEVEN_DAYS_MS = 7UL * 24UL * 60UL * 60UL * 1000UL;  // 604,800,000 ms

    if (elapsedMs > SEVEN_DAYS_MS) {
      // 可能刚重启，或者猫超过 7 天没进食（不太可能）
      // Probably just reset, or cat hasn't eaten in 7+ days (unlikely)
      minutesSinceFeeding = 0;
    } else {
      minutesSinceFeeding = elapsedMs / 60000UL;
    }
  }

  const float airQualityIndex = 30.0f;  // placeholder (no AQ sensor)

  // 🔒 修复：增加 JSON 缓冲区大小以容纳所有可选字段
  // Fix: Increased JSON buffer size to accommodate all optional fields
  // 🔧 进一步增加缓冲区以防止 ESP8266 CIPSEND 失败 / Further increased to prevent ESP8266 CIPSEND failure
  StaticJsonDocument<3072> doc;
  JsonObject reading = doc.createNestedObject("reading");
  reading["temperatureC"] = temperatureC;
  reading["humidityPercent"] = humidityPercent;
  reading["waterIntakeMl"] = cumulativeWaterIntakeMl;
  reading["airQualityIndex"] = airQualityIndex;
  reading["foodWeightGrams"] = foodWeightGrams;
  reading["catWeightKg"] = catWeightKg;
  reading["lastFeedingMinutesAgo"] = minutesSinceFeeding;
  if (waterLevelPercent >= 0.0f) {
    reading["waterLevelPercent"] = waterLevelPercent;
  }
  reading["ambientLightPercent"] = ambientPercent;
  reading["catPresent"] = catPresent;
#if ENABLE_HX711
  reading["feederGateOpen"] = feederGateOpen;
#endif
  reading["timestampMs"] = nowMs;
#if ENABLE_DS3231
  if (rtcReady && hasRtcNow) {
    reading["timestampUnix"] = rtcNow.unixtime();
    reading["timestampIso"] = formatIsoTimestamp(rtcNow);
  }
#endif

  // 🔧 注释掉 raw 对象以减少数据量，防止 ESP8266 CIPSEND 失败
  // Commented out raw object to reduce payload size and prevent ESP8266 CIPSEND failure
  // JsonObject raw = reading.createNestedObject("raw");
  // raw["ldrAdc"] = ldrAdc;
  // raw["distanceCm"] = distanceCm;
// #if ENABLE_HX711
  // raw["foodRaw"] = static_cast<double>(lastFoodRaw);
  // raw["foodZeroRaw"] = static_cast<double>(foodZeroRaw);
  // raw["foodScale"] = static_cast<double>(foodScale);
  // raw["feederGateOpen"] = feederGateOpen;
// #endif
// #if ENABLE_HYDRATION
  // raw["waterSensor"] = hydrationState.waterLevel;
// #endif
// #if ENABLE_ST021
  // raw["st021Ready"] = st021Ready;
// #endif
// #if ENABLE_ESP8266
  // raw["wifiConnected"] = wifiConnected;
// #endif

#if ENABLE_HX711
  JsonObject feeder = reading.createNestedObject("feeder");
  feeder["feedingActive"] = feederState.feedingActive;
  feeder["calibrationMode"] = feederState.calibrationMode;
  feeder["targetWeightGrams"] = feederState.targetWeightGrams;
  feeder["minWeightGrams"] = feederState.minWeightGrams;
  feeder["gateOpen"] = feederGateOpen;
  feeder["manualButtonLatched"] = feederState.manualButtonLatched;
  if (feederState.feedingStartedUnix != 0) {
    feeder["lastStartUnix"] = feederState.feedingStartedUnix;
  }
  JsonArray schedule = feeder.createNestedArray("schedule");
  for (uint8_t i = 0; i < feederScheduleSlotCount; ++i) {
    const FeederScheduleSlot& slot = feederScheduleSlots[i];
    JsonObject slotJson = schedule.createNestedObject();
    slotJson["hour"] = slot.hour;
    slotJson["minute"] = slot.minute;
    slotJson["completed"] = slot.completed;
  }
#endif

#if ENABLE_HYDRATION
  JsonObject hydration = reading.createNestedObject("hydration");
  hydration["sensorRaw"] = hydrationState.waterLevel;
  hydration["pumpActive"] = hydrationState.pumpActive;
  hydration["manualOverride"] = hydrationState.manualOverrideActive;
  hydration["threshold"] = WATER_THRESHOLD;
  hydration["hasPumpedMorning"] = hydrationState.hasPumpedMorning;
  hydration["hasPumpedNoon"] = hydrationState.hasPumpedNoon;
  hydration["hasPumpedAfternoon"] = hydrationState.hasPumpedAfternoon;
  hydration["hasPumpedEvening"] = hydrationState.hasPumpedEvening;
  hydration["lastRefillMs"] = static_cast<double>(hydrationState.lastRefillMs);
  if (hydrationState.lastRefillUnix != 0) {
    hydration["lastRefillUnix"] = hydrationState.lastRefillUnix;
  }
#endif

#if ENABLE_AUDIO
  JsonObject audio = reading.createNestedObject("audio");
  audio["amplifierOnline"] = audioModuleReady;
  audio["muted"] = audioMuted;
  audio["volumePercent"] = audioVolumePercent;
  audio["activePattern"] = audioPatternName(audioState.activePattern);
  audio["playing"] = audioIsPlaying();
  audio["lastPattern"] = audioPatternName(audioLastPattern);
  audio["lastTriggeredAtMs"] = static_cast<double>(audioState.lastTriggerMs);
#endif

#if ENABLE_UV_FAN
  JsonObject uv = reading.createNestedObject("uvFan");
  uv["uvOn"] = uvFanState.uvOn;
  uv["fanOn"] = uvFanState.fanOn;
  uv["autoMode"] = uvFanState.autoMode;
  uv["cleaningActive"] = uvFanState.cleaningActive;
  uv["cleaningDurationMs"] = static_cast<double>(uvFanState.cleaningDurationMs);
  if (uvFanState.cleaningActive) {
    unsigned long elapsed = nowMs >= uvFanState.cleaningStartedMs ? (nowMs - uvFanState.cleaningStartedMs) : 0;
    unsigned long remaining = (elapsed >= uvFanState.cleaningDurationMs)
      ? 0
      : (uvFanState.cleaningDurationMs - elapsed);
    uv["cleaningRemainingMs"] = static_cast<double>(remaining);
  }
  if (uvFanState.lastRunUnix != 0) {
    uv["lastRunUnix"] = uvFanState.lastRunUnix;
#if ENABLE_DS3231
    uv["lastRunIso"] = formatIsoTimestamp(DateTime(uvFanState.lastRunUnix));
#endif
  }
  if (uvFanState.nextAutoUnix != 0) {
    uv["nextAutoUnix"] = uvFanState.nextAutoUnix;
#if ENABLE_DS3231
    uv["nextAutoIso"] = formatIsoTimestamp(DateTime(uvFanState.nextAutoUnix));
#endif
  }
  if (uvFanState.nextAutoMillis != 0) {
    unsigned long untilAuto = uvFanState.nextAutoMillis > nowMs ? (uvFanState.nextAutoMillis - nowMs) : 0;
    uv["nextAutoInMs"] = static_cast<double>(untilAuto);
  }
#endif

// 🔧 暂时禁用 hardwareResults 以避免 JSON 解析错误和减少数据量
// Temporarily disabled hardwareResults to prevent JSON parse errors and reduce payload size
// ACK 应该通过单独的 POST 请求发送 / ACKs should be sent via separate POST requests
// #if ENABLE_ESP8266
//   if (pendingHardwareCommandResultCount > 0) {
//     JsonArray results = doc.createNestedArray("hardwareResults");
//     for (uint8_t i = 0; i < pendingHardwareCommandResultCount; ++i) {
//       const HardwareCommandResultEntry& entry = pendingHardwareCommandResults[i];
//       JsonObject result = results.createNestedObject();
//       result["id"] = entry.id;
//       result["status"] = entry.success ? "success" : "error";
//       if (entry.message[0] != '\0') {
//         result["message"] = entry.message;
//       }
//     }
//     pendingHardwareCommandResultCount = 0;
//   }
// #endif

  // 🔒 修复：检查 JSON 缓冲区溢出
  // Fix: Check for JSON buffer overflow
  if (doc.overflowed()) {
    Serial.println(F("{\"error\":\"jsonBufferOverflow\",\"message\":\"Document exceeded buffer size\"}"));
    return;  // 不发送损坏的数据 / Don't send corrupted data
  }

  String payload;
  serializeJson(doc, payload);
  Serial.println(payload);

#if ENABLE_ESP8266
  if (esp8266Ready) {
    if (!wifiConnected) {
      esp8266EnsureWifi();
    }
    if (wifiConnected) {
      String snapshotResponse;
      if (esp8266PostJson(payload, &snapshotResponse)) {
        processInlineHardwareCommands(snapshotResponse);
      }
    }
  }
#endif
}
void bootLog(const __FlashStringHelper* stage) {
  Serial.print(F("{\"boot\":\""));
  Serial.print(stage);
  Serial.println(F("\"}"));
  Serial.flush();
  delay(10);
}

void bootLog(const char* stage) {
  Serial.print(F("{\"boot\":\""));
  Serial.print(stage);
  Serial.println(F("\"}"));
  Serial.flush();
  delay(10);
}

bool probeI2cDevice(uint8_t address, uint16_t waitUs) {
  Wire.beginTransmission(address);
  uint8_t result = Wire.endTransmission(true);
  if (result == 0 && waitUs > 0) {
    delayMicroseconds(waitUs);
  }
  return result == 0;
}

String extractJsonPayload(const String& text) {
  int start = -1;
  int depth = 0;
  bool inString = false;
  bool escapeNext = false;
  for (int i = 0; i < text.length(); ++i) {
    char c = text[i];
    if (start < 0) {
      if (c == '{' || c == '[') {
        start = i;
        depth = 1;
        continue;
      }
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (c == '\\') {
        escapeNext = true;
      } else if (c == '"') {
        inString = false;
      }
      continue;
    }

    if (c == '"') {
      inString = true;
      continue;
    }
    if (c == '{' || c == '[') {
      depth++;
    } else if (c == '}' || c == ']') {
      depth--;
      if (depth == 0) {
        return text.substring(start, i + 1);
      }
    }
  }
  if (start >= 0) {
    return text.substring(start);
  }
  return "";
}

String stripIpdPrefixes(const String& text) {
  String output;
  output.reserve(text.length());
  size_t i = 0;
  while (i < text.length()) {
    if (text.startsWith("+IPD,", i)) {
      while (output.length() > 0) {
        char last = output.charAt(output.length() - 1);
        if (last == '\r' || last == '\n') {
          output.remove(output.length() - 1);
        } else {
          break;
        }
      }
      int colon = text.indexOf(':', i);
      if (colon < 0) {
        break;
      }
      i = static_cast<size_t>(colon + 1);
      continue;
    }
    if (text.startsWith("CLOSED", i)) {
      i += 6;
      continue;
    }
    if (text.startsWith("\r\nCLOSED", i)) {
      i += 8;
      continue;
    }
    output += text.charAt(i++);
  }
  return output;
}

String resolveHttpJsonBody(const String& preferred, const String& raw) {
  if (preferred.length() > 0) {
    return preferred;
  }
  if (raw.length() == 0) {
    return preferred;
  }

  String cleaned = stripIpdPrefixes(raw);
  String extracted = extractJsonPayload(cleaned);
  if (extracted.length() == 0) {
    extracted = extractJsonPayload(raw);
  }
  if (extracted.length() > 0) {
    return extracted;
  }
  cleaned.trim();
  return cleaned.length() > 0 ? cleaned : raw;
}
