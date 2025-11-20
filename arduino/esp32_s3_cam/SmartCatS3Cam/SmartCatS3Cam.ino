#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "img_converters.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include <string.h>

#include "camera_credentials.h"

#ifndef CAMERA_WIFI_SSID
#error "camera_credentials.h 未定義 CAMERA_WIFI_SSID，請先複製 camera_credentials.h.example 後再編譯。"
#endif

#ifndef CAMERA_DETECTION_INTERVAL_MS
#define CAMERA_DETECTION_INTERVAL_MS 2000UL
#endif

#ifndef CAMERA_EVENT_MIN_INTERVAL_MS
#define CAMERA_EVENT_MIN_INTERVAL_MS 8000UL
#endif

#ifndef CAMERA_CAT_THRESHOLD
#define CAMERA_CAT_THRESHOLD 0.62f
#endif

// ====== ESP32-S3 CAM (ESP32-S3-EYE) 預設腳位 ======
#define CAM_PIN_PWDN   -1
#define CAM_PIN_RESET  -1
#define CAM_PIN_XCLK   40
#define CAM_PIN_SIOD   17
#define CAM_PIN_SIOC   18

#define CAM_PIN_D7     41
#define CAM_PIN_D6     42
#define CAM_PIN_D5     39
#define CAM_PIN_D4     14
#define CAM_PIN_D3     47
#define CAM_PIN_D2     48
#define CAM_PIN_D1     21
#define CAM_PIN_D0     38
#define CAM_PIN_VSYNC  46
#define CAM_PIN_HREF   3
#define CAM_PIN_PCLK   45
#define CAM_PIN_LED    44

constexpr float CAT_THRESHOLD = CAMERA_CAT_THRESHOLD;
constexpr unsigned long DETECTION_INTERVAL_MS = CAMERA_DETECTION_INTERVAL_MS;
constexpr unsigned long EVENT_MIN_INTERVAL_MS = CAMERA_EVENT_MIN_INTERVAL_MS;

constexpr float MODEL_INTERCEPT = -7.2f;
constexpr float MODEL_MEAN_WEIGHT = 0.045f;
constexpr float MODEL_STD_WEIGHT = 0.060f;
constexpr float MODEL_EDGE_WEIGHT = 0.080f;

struct VisionMetrics {
  bool catDetected = false;
  float probability = 0.0f;
  float mean = 0.0f;
  float standardDeviation = 0.0f;
  float edgeDensity = 0.0f;
  unsigned long updatedAt = 0;
  unsigned long lastUploadedAt = 0;
};

WebServer server(80);
VisionMetrics visionState;

uint8_t* rgbBuffer = nullptr;
size_t rgbBufferCapacity = 0;
uint8_t* grayscaleBuffer = nullptr;
size_t grayscaleCapacity = 0;

unsigned long lastDetectionRunMs = 0;
unsigned long ledActiveUntilMs = 0;
unsigned long lastWifiAttemptMs = 0;
bool wifiConnecting = false;

String backendBaseUrl = CAMERA_BACKEND_BASE_URL;
String backendEventPath = CAMERA_BACKEND_EVENT_PATH;

void ensureBuffers(size_t pixelCount) {
  const size_t requiredRgb = pixelCount * 3;
  if (requiredRgb > rgbBufferCapacity) {
    if (rgbBuffer) {
      heap_caps_free(rgbBuffer);
    }
    rgbBuffer = static_cast<uint8_t*>(heap_caps_malloc(requiredRgb, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    rgbBufferCapacity = rgbBuffer ? requiredRgb : 0;
  }

  if (pixelCount > grayscaleCapacity) {
    if (grayscaleBuffer) {
      heap_caps_free(grayscaleBuffer);
    }
    grayscaleBuffer = static_cast<uint8_t*>(heap_caps_malloc(pixelCount, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    grayscaleCapacity = grayscaleBuffer ? pixelCount : 0;
  }
}

void indicateDetection(bool active) {
  if (CAM_PIN_LED >= 0) {
    digitalWrite(CAM_PIN_LED, active ? HIGH : LOW);
  }
}

String buildBackendUrl() {
  if (backendBaseUrl.endsWith("/")) {
    return backendBaseUrl.substring(0, backendBaseUrl.length() - 1) + backendEventPath;
  }
  return backendBaseUrl + backendEventPath;
}

bool postDetectionEvent(const VisionMetrics& metrics) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClient wifiClient;
  WiFiClientSecure wifiClientSecure;
  WiFiClient* client = &wifiClient;

  String url = buildBackendUrl();
  if (url.startsWith("https://")) {
    wifiClientSecure.setInsecure();
    client = &wifiClientSecure;
  }

  HTTPClient http;
  if (!http.begin(*client, url)) {
    Serial.println(F("[camera] 無法初始化 HTTP 連線"));
    return false;
  }

  StaticJsonDocument<320> doc;
  doc["deviceId"] = CAMERA_DEVICE_ID;
  doc["catDetected"] = metrics.catDetected;
  doc["probability"] = metrics.probability;
  doc["mean"] = metrics.mean;
  doc["stdDev"] = metrics.standardDeviation;
  doc["edgeDensity"] = metrics.edgeDensity;
  doc["timestampMs"] = metrics.updatedAt;

  String payload;
  serializeJson(doc, payload);

  http.addHeader("Content-Type", "application/json");
#ifdef CAMERA_API_KEY
  if (strlen(CAMERA_API_KEY) > 0) {
    http.addHeader("Authorization", String("Bearer ") + CAMERA_API_KEY);
  }
#endif

  const int status = http.POST(payload);
  http.end();

  if (status >= 200 && status < 300) {
    Serial.print(F("[camera] 事件上傳成功 catDetected="));
    Serial.print(metrics.catDetected ? F("true") : F("false"));
    Serial.print(F(" prob="));
    Serial.println(metrics.probability, 3);
    return true;
  }

  Serial.print(F("[camera] 事件上傳失敗 status="));
  Serial.println(status);
  return false;
}

void updateIndicators() {
  const unsigned long now = millis();
  if (now < ledActiveUntilMs) {
    indicateDetection(true);
  } else {
    indicateDetection(false);
  }
}

void runDetection() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println(F("[camera] 無法取得影像緩衝"));
    return;
  }

  const size_t pixelCount = static_cast<size_t>(fb->width) * static_cast<size_t>(fb->height);
  ensureBuffers(pixelCount);
  if (!rgbBuffer || !grayscaleBuffer) {
    Serial.println(F("[camera] 記憶體不足，略過偵測"));
    esp_camera_fb_return(fb);
    return;
  }

  if (!fmt2rgb888(fb->buf, fb->len, fb->format, rgbBuffer)) {
    Serial.println(F("[camera] 影像轉換失敗"));
    esp_camera_fb_return(fb);
    return;
  }

  double sum = 0.0;
  double sumSq = 0.0;
  uint64_t edgeAccumulator = 0;

  for (size_t index = 0; index < pixelCount; ++index) {
    const uint8_t r = rgbBuffer[index * 3];
    const uint8_t g = rgbBuffer[index * 3 + 1];
    const uint8_t b = rgbBuffer[index * 3 + 2];
    const float gray = 0.299f * static_cast<float>(r) + 0.587f * static_cast<float>(g) + 0.114f * static_cast<float>(b);
    const uint8_t grayByte = static_cast<uint8_t>(fminf(fmaxf(gray, 0.0f), 255.0f));
    grayscaleBuffer[index] = grayByte;
    sum += gray;
    sumSq += gray * gray;
  }

  const uint16_t width = fb->width;
  const uint16_t height = fb->height;
  for (uint16_t y = 0; y < height - 1; ++y) {
    const size_t row = static_cast<size_t>(y) * width;
    for (uint16_t x = 0; x < width - 1; ++x) {
      const size_t idx = row + x;
      const uint8_t current = grayscaleBuffer[idx];
      edgeAccumulator += abs(current - grayscaleBuffer[idx + 1]);
      edgeAccumulator += abs(current - grayscaleBuffer[idx + width]);
    }
  }

  const double count = static_cast<double>(pixelCount);
  const double mean = sum / count;
  const double variance = fmax(0.0, (sumSq / count) - (mean * mean));
  const double stdDev = sqrt(variance);
  const double edgeNorm = static_cast<double>(edgeAccumulator) /
    static_cast<double>((width - 1) * (height - 1) * 2);

  const float score =
    MODEL_INTERCEPT +
    (MODEL_MEAN_WEIGHT * static_cast<float>(mean)) +
    (MODEL_STD_WEIGHT * static_cast<float>(stdDev)) +
    (MODEL_EDGE_WEIGHT * static_cast<float>(edgeNorm));

  const float probability = 1.0f / (1.0f + expf(-score));
  const bool detected = probability >= CAT_THRESHOLD;

  visionState.mean = static_cast<float>(mean);
  visionState.standardDeviation = static_cast<float>(stdDev);
  visionState.edgeDensity = static_cast<float>(edgeNorm);
  visionState.probability = probability;
  const bool previousDetected = visionState.catDetected;
  visionState.catDetected = detected;
  visionState.updatedAt = millis();

  if (detected) {
    ledActiveUntilMs = visionState.updatedAt + 1500UL;
  }

  const bool stateChanged = (previousDetected != detected);
  const bool shouldUpload =
    (stateChanged || (detected && probability >= 0.8f)) &&
    (visionState.updatedAt - visionState.lastUploadedAt >= EVENT_MIN_INTERVAL_MS);

  if (shouldUpload) {
    if (postDetectionEvent(visionState)) {
      visionState.lastUploadedAt = visionState.updatedAt;
    }
  }

  esp_camera_fb_return(fb);
}

void handleStatus() {
  if (!authorizeRequest()) {
    rejectUnauthorized();
    return;
  }
  StaticJsonDocument<320> doc;
  doc["deviceId"] = CAMERA_DEVICE_ID;
  doc["uptimeMs"] = millis();
  doc["wifiRssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  doc["catDetected"] = visionState.catDetected;
  doc["probability"] = visionState.probability;
  doc["mean"] = visionState.mean;
  doc["stdDev"] = visionState.standardDeviation;
  doc["edgeDensity"] = visionState.edgeDensity;
  doc["updatedAtMs"] = visionState.updatedAt;
  doc["model"] = "logistic-lite-v1";
  doc["threshold"] = CAT_THRESHOLD;

  String payload;
  serializeJson(doc, payload);
  server.send(200, "application/json", payload);
}

void handleHealth() {
  if (authorizeRequest()) {
    server.send(200, "text/plain", "ok");
  } else {
    rejectUnauthorized();
  }
}

void handleSnapshot() {
  if (!authorizeRequest()) {
    rejectUnauthorized();
    return;
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "application/json", "{\"ok\":false,\"error\":\"capture_failed\"}");
    return;
  }

  server.sendHeader("Content-Type", "image/jpeg");
  server.sendHeader("Content-Length", String(fb->len));
  WiFiClient client = server.client();
  if (client.connected()) {
    client.write(fb->buf, fb->len);
  }
  esp_camera_fb_return(fb);
}

void configureCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAM_PIN_D0;
  config.pin_d1 = CAM_PIN_D1;
  config.pin_d2 = CAM_PIN_D2;
  config.pin_d3 = CAM_PIN_D3;
  config.pin_d4 = CAM_PIN_D4;
  config.pin_d5 = CAM_PIN_D5;
  config.pin_d6 = CAM_PIN_D6;
  config.pin_d7 = CAM_PIN_D7;
  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_pclk = CAM_PIN_PCLK;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[camera] 初始化失敗，錯誤碼 0x%X\n", static_cast<unsigned>(err));
    delay(3000);
    ESP.restart();
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_brightness(sensor, 1);
    sensor->set_saturation(sensor, 0);
    sensor->set_contrast(sensor, 1);
    sensor->set_framesize(sensor, FRAMESIZE_QVGA);
    sensor->set_whitebal(sensor, 1);
  }

  Serial.println(F("[camera] 相機初始化完成"));
}

void connectWifi() {
  if (wifiConnecting) {
    return;
  }
  wifiConnecting = true;
  lastWifiAttemptMs = millis();

  WiFi.mode(WIFI_STA);
  WiFi.begin(CAMERA_WIFI_SSID, CAMERA_WIFI_PASSWORD);

  Serial.print(F("[wifi] 連線中"));
  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000UL) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[wifi] IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("[wifi] 連線失敗"));
    WiFi.disconnect(true);
  }

  wifiConnecting = false;
}

void ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  if (millis() - lastWifiAttemptMs > 10000UL) {
    connectWifi();
  }
}

void configureServer() {
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/healthz", HTTP_GET, handleHealth);
  server.on("/snapshot.jpg", HTTP_GET, handleSnapshot);
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"ok\":false,\"error\":\"not_found\"}");
  });
  server.begin();
  Serial.println(F("[server] HTTP 伺服器啟動於 http://<device-ip>/"));
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println(F("Smart Cat ESP32-S3 CAM 啟動"));

  if (!psramFound()) {
    Serial.println(F("[warning] 未偵測到 PSRAM，影像緩衝可能不足"));
  }

  if (CAM_PIN_LED >= 0) {
    pinMode(CAM_PIN_LED, OUTPUT);
    digitalWrite(CAM_PIN_LED, LOW);
  }

  connectWifi();
  configureCamera();
  configureServer();
}

void loop() {
  server.handleClient();
  ensureWifiConnected();
  updateIndicators();

  const unsigned long now = millis();
  if (now - lastDetectionRunMs >= DETECTION_INTERVAL_MS) {
    lastDetectionRunMs = now;
    runDetection();
  }
}
#ifndef CAMERA_API_KEY
#define CAMERA_API_KEY ""
#endif
bool isAuthRequired() {
  return strlen(CAMERA_API_KEY) > 0;
}

bool authorizeRequest() {
  if (!isAuthRequired()) {
    return true;
  }
  if (!server.hasHeader("Authorization")) {
    return false;
  }
  String header = server.header("Authorization");
  header.trim();
  if (!header.startsWith("Bearer ")) {
    return false;
  }
  String token = header.substring(7);
  token.trim();
  return token.equals(CAMERA_API_KEY);
}

void rejectUnauthorized() {
  server.send(401, "application/json", "{\"ok\":false,\"error\":\"unauthorized\"}");
}
