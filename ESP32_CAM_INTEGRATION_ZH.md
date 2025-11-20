# 🎥 ESP32-S3 CAM 集成指南

## 📋 目录
1. [网络连接方案](#网络连接方案)
2. [后端配置](#后端配置)
3. [ESP32-S3 固件配置](#esp32-s3-固件配置)
4. [前端显示](#前端显示)
5. [故障排除](#故障排除)

---

## 🌐 网络连接方案

### **问题诊断**

ESP32-S3 CAM 默认 IP 地址 `192.168.5.1` 表示它运行在 **AP（接入点）模式**：
- 摄像头自己创建一个 Wi-Fi 热点
- 你的电脑需要连接到这个热点才能访问
- **问题**：连接到 ESP32 热点后，你会失去互联网连接

### **方案 1：Station 模式（推荐）** ⭐⭐⭐

让 ESP32-S3 连接到你的家庭 Wi-Fi，而不是作为热点。

#### 优点：
- ✅ 所有设备在同一网络，无需切换连接
- ✅ 可以同时访问互联网和摄像头
- ✅ 电脑、手机都能访问
- ✅ 后端服务器可以直接拉取照片

#### 配置步骤：

1. **修改 ESP32 固件配置**（通过串口或配置页面）：

```cpp
// ESP32-S3 Arduino 代码示例
const char* ssid = "你的WiFi名称";
const char* password = "你的WiFi密码";

void setup() {
  WiFi.mode(WIFI_STA);  // Station 模式
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());  // 记住这个 IP！
}
```

2. **ESP32 会获得一个局域网 IP**（例如 `192.168.0.123`）

3. **在后端配置中使用这个 IP**：

编辑 `/Users/meaqua/Desktop/EE3070/smart-cat-backend/.env`：

```bash
# 修改为 ESP32 在你局域网中的 IP
CAMERA_BASE_URL=http://192.168.0.123
CAMERA_STATUS_PATH=/status
CAMERA_SNAPSHOT_PATH=/snapshot
CAMERA_API_KEY=
```

---

### **方案 2：AP 模式 + 双网卡**（临时方案）

如果你无法修改固件，可以使用两个网络接口。

#### 需求：
- 电脑有两个网络接口（Wi-Fi + 以太网，或 USB Wi-Fi 适配器）

#### 步骤：

1. **以太网连接到家庭路由器**（用于互联网）
2. **Wi-Fi 连接到 ESP32-S3 热点**（192.168.5.1）
3. **配置路由表**（让特定流量走 ESP32，其他走路由器）

**Mac/Linux 命令**：
```bash
# 查看路由表
netstat -rn

# 添加静态路由（让 192.168.5.0/24 走 ESP32 接口）
sudo route add -net 192.168.5.0/24 192.168.5.1
```

**Windows 命令**：
```cmd
route ADD 192.168.5.0 MASK 255.255.255.0 192.168.5.1
```

---

### **方案 3：后端代理模式**（最灵活）⭐⭐⭐

让后端服务器作为摄像头代理，前端不直接访问摄像头。

#### 架构：
```
前端浏览器 <--HTTP--> 后端服务器 <--HTTP--> ESP32-S3 CAM
  (localhost:5173)    (localhost:4000)       (192.168.5.1)
```

#### 优点：
- ✅ 解决跨域（CORS）问题
- ✅ 可以添加鉴权和访问控制
- ✅ 统一的 API 接口
- ✅ 支持图像预处理（压缩、水印等）

#### 实现：

**后端已经实现了代理功能！** 🎉

查看 `src/camera.ts:234-271` - `fetchCameraSnapshotBuffer()` 函数

使用方法：

```bash
# 在 .env 中配置 ESP32 地址
CAMERA_BASE_URL=http://192.168.5.1
CAMERA_SNAPSHOT_PATH=/snapshot
```

前端访问：
```javascript
// 通过后端代理获取照片
const response = await fetch('http://localhost:4000/api/camera/snapshot')
const blob = await response.blob()
const imageUrl = URL.createObjectURL(blob)
```

---

## 🔧 后端配置

### **1. 编辑环境变量**

编辑 `/Users/meaqua/Desktop/EE3070/smart-cat-backend/.env`：

```bash
# ESP32-S3 CAM 配置
CAMERA_BASE_URL=http://192.168.5.1    # 或你的 Station 模式 IP
CAMERA_STATUS_PATH=/status             # ESP32 状态端点
CAMERA_SNAPSHOT_PATH=/snapshot         # 快照端点（不是 /snapshot.jpg）
CAMERA_API_KEY=                        # 如果 ESP32 需要鉴权，填写密钥
```

### **2. ESP32-S3 常见端点**

根据你的固件，ESP32-S3 可能提供以下端点：

| 端点 | 功能 | 示例 |
|------|------|------|
| `/` | 主页（Web UI） | http://192.168.5.1/ |
| `/capture` 或 `/snapshot` | 单张照片（JPEG） | http://192.168.5.1/capture |
| `/stream` | MJPEG 视频流 | http://192.168.5.1/stream |
| `/status` | 摄像头状态 | http://192.168.5.1/status |
| `/control?var=...&val=...` | 控制参数（亮度、对比度等） | http://192.168.5.1/control?var=brightness&val=1 |

**测试你的 ESP32 端点**：

```bash
# 方法 1：用浏览器直接访问
# 连接到 ESP32 热点后，访问 http://192.168.5.1

# 方法 2：用 curl 测试
curl -o test.jpg http://192.168.5.1/capture

# 方法 3：测试视频流
curl http://192.168.5.1/stream | head -100
```

### **3. 重启后端服务**

```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend

# 使用 dev 模式（更新 .env 后会自动重载）
npm run dev

# 或构建后启动
npm run build && npm start
```

---

## 🎬 ESP32-S3 固件配置

### **推荐固件：CameraWebServer（Arduino IDE）**

ESP32-S3 官方示例固件，支持完整的摄像头功能。

#### 安装步骤：

1. **安装 Arduino IDE**
   - 下载：https://www.arduino.cc/en/software

2. **添加 ESP32 开发板支持**
   ```
   Arduino IDE → 设置 → 附加开发板管理器网址：
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```

3. **打开示例代码**
   ```
   文件 → 示例 → ESP32 → Camera → CameraWebServer
   ```

4. **配置代码**

   找到以下部分并修改：

   ```cpp
   // 选择你的摄像头模块型号
   #define CAMERA_MODEL_ESP32S3_EYE  // 根据你的硬件选择

   // Wi-Fi 配置 - Station 模式（推荐）
   const char* ssid = "你的WiFi名称";
   const char* password = "你的WiFi密码";

   // 摄像头分辨率
   config.frame_size = FRAMESIZE_SVGA;  // 800x600
   config.jpeg_quality = 10;            // 0-63，数字越小质量越高
   ```

5. **上传到 ESP32**
   - 选择开发板：`ESP32S3 Dev Module`
   - 端口：选择你的串口
   - 点击"上传"

6. **查看 IP 地址**
   - 打开串口监视器（115200 波特率）
   - 重启 ESP32
   - 会显示：`Camera Ready! Use 'http://192.168.x.x' to connect`

---

### **Station 模式配置示例**

完整的 Arduino 代码片段：

```cpp
#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"

// 相机引脚配置（ESP32-S3-EYE 示例）
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5

#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13

// Wi-Fi 配置
const char* ssid = "你的WiFi名称";
const char* password = "你的WiFi密码";

// HTTP 端点处理函数
static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_send(req, (const char *)fb->buf, fb->len);

  esp_camera_fb_return(fb);
  return ESP_OK;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  httpd_handle_t server = NULL;

  if (httpd_start(&server, &config) == ESP_OK) {
    httpd_uri_t capture_uri = {
      .uri       = "/capture",
      .method    = HTTP_GET,
      .handler   = capture_handler,
      .user_ctx  = NULL
    };
    httpd_register_uri_handler(server, &capture_uri);
  }
}

void setup() {
  Serial.begin(115200);

  // 连接 Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  // 初始化相机
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // 根据 PSRAM 选择分辨率
  if(psramFound()){
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_CIF;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  // 启动 Web 服务器
  startCameraServer();
}

void loop() {
  delay(10000);
}
```

上传这段代码后，ESP32 会：
1. 连接到你的 Wi-Fi
2. 在串口监视器显示 IP 地址
3. 提供 `/capture` 端点获取照片

---

## 🖼️ 前端显示

### **方案 1：直接显示（简单）**

如果后端和前端在同一网络，可以直接显示：

```tsx
// React 组件示例
import { useState, useEffect } from 'react'

export function CameraView() {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const capturePhoto = async () => {
    setLoading(true)
    try {
      // 方案 A：直接访问 ESP32（需要在同一网络）
      const response = await fetch('http://192.168.5.1/capture')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl(url)
    } catch (error) {
      console.error('Failed to capture:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={capturePhoto} disabled={loading}>
        {loading ? '拍摄中...' : '拍摄照片'}
      </button>
      {imageUrl && <img src={imageUrl} alt="ESP32 Camera" />}
    </div>
  )
}
```

### **方案 2：通过后端代理（推荐）** ⭐

更安全，解决跨域问题：

```tsx
export function CameraView() {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const capturePhoto = async () => {
    setLoading(true)
    try {
      // 通过后端代理获取（已经在你的系统中实现）
      const response = await fetch('http://localhost:4000/api/camera/snapshot')
      if (!response.ok) throw new Error('拍摄失败')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      // 清理旧的 URL
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      setImageUrl(url)
    } catch (error) {
      console.error('Failed to capture:', error)
      alert('拍摄失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 定时刷新（可选）
  useEffect(() => {
    const interval = setInterval(capturePhoto, 5000) // 每 5 秒更新
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="camera-container">
      <div className="camera-controls">
        <button onClick={capturePhoto} disabled={loading}>
          {loading ? '拍摄中...' : '手动拍摄'}
        </button>
      </div>

      {imageUrl ? (
        <img
          src={imageUrl}
          alt="ESP32 Camera Feed"
          className="camera-image"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      ) : (
        <div className="camera-placeholder">
          点击"拍摄照片"开始
        </div>
      )}
    </div>
  )
}
```

### **方案 3：视频流（MJPEG）**

如果 ESP32 支持 `/stream` 端点：

```tsx
export function CameraStream() {
  const streamUrl = 'http://192.168.5.1/stream'  // 或通过后端代理

  return (
    <div>
      <img
        src={streamUrl}
        alt="ESP32 Camera Stream"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  )
}
```

**注意**：MJPEG 流会持续消耗带宽，适合实时监控但不适合移动网络。

---

## 🔍 故障排除

### **问题 1：无法访问 192.168.5.1**

**原因**：电脑没有连接到 ESP32 的 Wi-Fi 热点

**解决**：
1. 打开 Wi-Fi 设置
2. 查找名为 `ESP32-CAM` 或类似的热点
3. 连接（密码通常在 ESP32 串口输出中）
4. 浏览器访问 http://192.168.5.1

### **问题 2：CORS 错误**

**错误信息**：
```
Access to fetch at 'http://192.168.5.1/capture' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**解决方案 A**：在 ESP32 固件中添加 CORS 头
```cpp
httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
```

**解决方案 B**：使用后端代理（推荐）
```bash
# 在 .env 中配置
CAMERA_BASE_URL=http://192.168.5.1

# 前端访问
fetch('http://localhost:4000/api/camera/snapshot')
```

### **问题 3：照片加载很慢**

**原因**：
- ESP32 处理能力有限
- JPEG 质量设置过高
- 网络信号差

**优化**：
```cpp
// 在 ESP32 固件中调整
config.jpeg_quality = 12;      // 降低质量（0-63，越大压缩越多）
config.frame_size = FRAMESIZE_VGA;  // 降低分辨率（640x480）
```

### **问题 4：ESP32 经常断线**

**可能原因**：
- Wi-Fi 信号弱
- 电源不足（ESP32-S3 CAM 需要稳定的 5V 供电）
- 固件 bug

**解决**：
1. 使用优质电源适配器（至少 2A）
2. 添加断线重连代码：

```cpp
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  delay(1000);
}
```

### **问题 5：后端无法拉取照片**

**检查清单**：

1. **网络连通性**
   ```bash
   # 测试从后端服务器是否能访问 ESP32
   curl -v http://192.168.5.1/capture
   ```

2. **防火墙**
   ```bash
   # Mac 检查防火墙
   /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

   # 临时关闭防火墙测试
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
   ```

3. **端点路径**
   ```bash
   # 检查 .env 配置
   cat /Users/meaqua/Desktop/EE3070/smart-cat-backend/.env | grep CAMERA

   # 常见端点：
   # /capture, /snapshot, /cam.jpg, /photo.jpg
   ```

4. **后端日志**
   ```bash
   # 查看后端日志中的摄像头错误
   tail -f /Users/meaqua/Desktop/EE3070/backend.log | grep camera
   ```

---

## 🚀 快速测试流程

### **1. 连接 ESP32**
```bash
# 连接到 ESP32 Wi-Fi（如果是 AP 模式）
# 或确保 ESP32 已连接到你的 Wi-Fi（Station 模式）
```

### **2. 测试直接访问**
```bash
# 浏览器访问
open http://192.168.5.1

# 或用 curl
curl -o test.jpg http://192.168.5.1/capture
open test.jpg
```

### **3. 配置后端**
```bash
# 编辑 .env
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
nano .env

# 修改：
CAMERA_BASE_URL=http://192.168.5.1
CAMERA_SNAPSHOT_PATH=/capture

# 保存后重启后端
npm run build && npm start
```

### **4. 测试后端代理**
```bash
# 从后端获取照片
curl -o test2.jpg http://localhost:4000/api/camera/snapshot
open test2.jpg
```

### **5. 前端集成**
```bash
# 启动前端
cd /Users/meaqua/Desktop/EE3070/smart-cat-home
npm run dev

# 浏览器访问 http://localhost:5173
# 在 AI 聊天界面上传照片测试
```

---

## 📚 参考资源

- **ESP32-CAM 官方文档**：https://github.com/espressif/esp32-camera
- **Arduino ESP32 开发板**：https://github.com/espressif/arduino-esp32
- **CameraWebServer 示例**：Arduino IDE → 示例 → ESP32 → Camera
- **你的项目摄像头模块**：`/smart-cat-backend/src/camera.ts`

---

## 💡 推荐配置总结

### **最佳实践**：

1. ✅ **ESP32 使用 Station 模式**连接到家庭 Wi-Fi
2. ✅ **后端 .env 配置 ESP32 的局域网 IP**
3. ✅ **前端通过后端代理访问**（避免 CORS）
4. ✅ **调整 JPEG 质量平衡速度和清晰度**

### **配置示例**：

**ESP32 固件**：
```cpp
const char* ssid = "YourHomeWiFi";
const char* password = "YourPassword";
config.frame_size = FRAMESIZE_SVGA;  // 800x600
config.jpeg_quality = 10;
```

**后端 .env**：
```bash
CAMERA_BASE_URL=http://192.168.0.123  # ESP32 在局域网的 IP
CAMERA_SNAPSHOT_PATH=/capture
```

**前端代码**：
```tsx
const response = await fetch('http://localhost:4000/api/camera/snapshot')
const blob = await response.blob()
const imageUrl = URL.createObjectURL(blob)
```

---

需要帮助调试吗？提供以下信息我可以更具体地帮你：
1. ESP32-S3 的具体型号
2. 当前使用的固件/代码
3. ESP32 的 IP 地址和端点
4. 遇到的具体错误信息
