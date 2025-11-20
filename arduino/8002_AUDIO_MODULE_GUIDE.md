# 8002音频功放模块接线指南

## 📋 概述

本指南说明如何将8002单声道音频功放模块集成到Smart Cat Home系统中。

---

## 🔌 8002模块引脚说明

8002是一个单声道音频功放IC，典型引脚配置：

| 引脚 | 功能 | 说明 |
|------|------|------|
| VCC/VIN | 电源正极 | 通常3-5V，推荐5V |
| GND | 地 | 接Arduino GND |
| SD/S | Shutdown（关断） | **HIGH=工作，LOW=关断** |
| IN+/AIN | 音频输入正 | 接Arduino PWM引脚 |
| IN- | 音频输入负 | 通常接地 |
| OUT+ | 喇叭输出正 | 连接喇叭正极 |
| OUT- | 喇叭输出负 | 连接喇叭负极 |

---

## 🔧 接线图

### Arduino Mega 2560 ↔ 8002模块

```
Arduino Mega 2560          8002音频模块
┌─────────────┐           ┌──────────────┐
│             │           │              │
│  5V    ─────┼───────────┤ VCC/VIN      │
│  GND   ─────┼───────────┤ GND          │
│  D10   ─────┼───────────┤ SD (Shutdown)│
│  D11   ─────┼───────────┤ IN+ (Audio)  │
│             │           │ IN-  ────GND │
│             │           │              │
│             │           │ OUT+ ───┐    │
│             │           │ OUT- ───┼────┤
└─────────────┘           └─────────┼────┘
                                    │
                          ┌─────────┴────┐
                          │   喇叭 🔊     │
                          │  (8Ω, 0.5W)  │
                          └──────────────┘
```

**关键连接：**
- ✅ **D10** → 8002的SD引脚（控制开关）
- ✅ **D11** → 8002的IN+引脚（PWM音频信号）
- ✅ **8002的IN-** → GND（接地）
- ✅ **喇叭** → 连接到OUT+和OUT-

---

## ⚠️ 重要：引脚变更说明

为了腾出D10和D11给音频模块，以下按钮引脚已重新分配：

| 功能 | 原引脚 | 新引脚 | 说明 |
|------|--------|--------|------|
| 校正按钮 (BTN_CAL) | D10 | **D12** | 需要重新接线 |
| 去皮按钮 (BTN_TARE) | D11 | **A2** | 需要重新接线 |
| 音频SD引脚 | - | **D10** | 新增 |
| 音频信号引脚 | - | **D11** | 新增 |

**⚠️ 硬件调整：**
如果你之前有连接校正按钮和去皮按钮，请将它们移至新的引脚位置！

---

## 📝 代码修改总结

已更新的文件：`smart_cat_serial_bridge.ino`

### 1. 启用音频功能
```cpp
// 第5行
#define ENABLE_AUDIO 1  // ✅ 从0改为1
```

### 2. 更新引脚定义
```cpp
// 第1131-1132行
constexpr uint8_t AUDIO_SIGNAL_PIN = 11;  // PWM音频信号输出引脚
constexpr int8_t AUDIO_ENABLE_PIN = 10;   // 8002的SD引脚
```

### 3. 重新分配按钮引脚
```cpp
// 第136-138行
const uint8_t BTN_TARE_PIN = A2;   // 从D11移至A2
const uint8_t BTN_CAL_PIN = 12;    // 从D10移至D12
```

---

## 🎵 支持的音频模式

系统支持6种预定义的音频模式，用于不同场景：

| 模式 | 名称 | 用途 | 频率范围 |
|------|------|------|----------|
| `call-cat` | 呼唤猫咪 | 召唤猫咪回家 | 622-1047 Hz |
| `calm-chime` | 安抚音 | 放松、睡眠 | 440-523 Hz |
| `alert` | 警报 | 紧急提醒 | 1319-1568 Hz |
| `wake-up-lullaby` | 唤醒音 | 早晨唤醒 | 880-1568 Hz |
| `hydrate-reminder` | 饮水提醒 | 提醒喝水 | 659-988 Hz |
| `meow-call` | 喵叫模拟 | 互动玩耍 | 523-698 Hz |

---

## 🧪 测试步骤

### 步骤1：上传固件

```bash
# 在Arduino IDE中：
1. 打开 smart_cat_serial_bridge.ino
2. 选择板子：Tools > Board > Arduino Mega 2560
3. 选择端口：Tools > Port > (你的串口)
4. 点击上传按钮 ⬆️
```

### 步骤2：检查初始化

打开串口监视器（波特率：115200），你应该看到：

```json
{"event":"boot","firmware":"1.1.3-upload"}
{"module":"audioInit","status":"ready"}
```

### 步骤3：测试音频播放

通过后端API发送测试命令：

```bash
# 测试"呼唤猫咪"音频
curl -X POST http://localhost:4000/api/hardware/audio/play \
  -H "Content-Type: application/json" \
  -d '{"pattern": "call-cat", "repeat": 1}'

# 测试"安抚音"
curl -X POST http://localhost:4000/api/hardware/audio/play \
  -H "Content-Type: application/json" \
  -d '{"pattern": "calm-chime", "repeat": 2}'
```

或者通过前端AI聊天界面：
```
用户: "播放呼唤猫咪的声音"
AI: [调用playAudioPattern工具] ✅
```

### 步骤4：验证音量控制

```bash
# 设置音量为50%
curl -X POST http://localhost:4000/api/hardware/audio/volume \
  -H "Content-Type: application/json" \
  -d '{"volume": 50}'

# 静音
curl -X POST http://localhost:4000/api/hardware/audio/mute \
  -H "Content-Type: application/json" \
  -d '{"mute": true}'
```

---

## 🔊 喇叭选择建议

**推荐规格：**
- 阻抗：8Ω
- 功率：0.5W - 1W
- 类型：小型扬声器或压电蜂鸣器

**常见选项：**
1. **8Ω 0.5W小喇叭**（直径28-40mm）- 最常见
2. **压电蜂鸣器**（带震动片） - 音量更大但音质较差
3. **全频小音箱**（8Ω 1W） - 音质最好

---

## 🐛 故障排除

### 问题1：没有声音输出

**可能原因：**
- ❌ SD引脚连接错误
- ❌ 喇叭极性接反
- ❌ 8002模块损坏

**解决方案：**
1. 用万用表测试D10引脚，播放时应为HIGH（5V）
2. 检查喇叭连接，尝试交换OUT+和OUT-
3. 更换8002模块测试

### 问题2：声音失真或噪音

**可能原因：**
- ⚠️ 音量过大（超过100%）
- ⚠️ 喇叭阻抗不匹配
- ⚠️ 电源电压不稳定

**解决方案：**
1. 降低音量到70%以下
2. 确认喇叭为8Ω阻抗
3. 添加电源滤波电容（100µF）

### 问题3：音频模式无法切换

**可能原因：**
- ❌ `ENABLE_AUDIO`未启用
- ❌ 串口通信故障

**解决方案：**
1. 确认代码第5行：`#define ENABLE_AUDIO 1`
2. 检查串口监视器是否有错误信息
3. 重新上传固件

---

## 📡 JSON串口协议

Arduino通过串口发送JSON消息报告音频状态：

### 播放开始
```json
{"audio":"play","pattern":"call-cat"}
```

### 播放完成
```json
{"audio":"complete"}
```

### 静音状态
```json
{"audio":"muted","pattern":"calm-chime"}
```

### 模块未就绪
```json
{"audio":"moduleNotReady"}
```

---

## 🔄 与后端集成

后端会自动处理音频命令，支持以下API：

### POST /api/hardware/audio/play
播放指定音频模式

**请求体：**
```json
{
  "pattern": "call-cat",
  "repeat": 2
}
```

### POST /api/hardware/audio/stop
停止当前播放

### POST /api/hardware/audio/volume
设置音量（0-100%）

**请求体：**
```json
{
  "volume": 70
}
```

### POST /api/hardware/audio/mute
静音/取消静音

**请求体：**
```json
{
  "mute": true
}
```

---

## 💡 提示和技巧

1. **音量调节**：8002没有硬件音量控制，音量通过PWM占空比调节（代码中的`amplitudePercent`）

2. **音频序列定制**：可以在代码中修改`AUDIO_PATTERN_*_STEPS`数组来创建自定义音频

3. **省电模式**：不播放时SD引脚会设为LOW，关闭8002芯片以省电

4. **测试技巧**：上传代码后，按下D12（新的校正按钮）可以触发测试音（如果你在setup()中添加了测试代码）

---

## 📚 参考资料

- [8002数据手册](https://www.ti.com/lit/ds/symlink/tpa2001d1.pdf)（类似芯片参考）
- [Arduino tone()函数文档](https://www.arduino.cc/reference/en/language/functions/advanced-io/tone/)
- Smart Cat Home后端API文档：`/Users/meaqua/Desktop/EE3070/smart-cat-backend/CLAUDE.md`

---

## ✅ 检查清单

上传代码前请确认：

- [ ] 8002模块的VCC连接到5V
- [ ] 8002模块的GND连接到Arduino GND
- [ ] D10连接到8002的SD引脚
- [ ] D11连接到8002的IN+引脚
- [ ] 8002的IN-接地
- [ ] 喇叭正确连接到OUT+和OUT-
- [ ] 校正按钮已移至D12（如需要）
- [ ] 去皮按钮已移至A2（如需要）
- [ ] `ENABLE_AUDIO`设置为1
- [ ] 固件版本包含"-upload"后缀

完成后，你的Smart Cat Home系统就可以播放6种不同的音频模式来与你的猫咪互动了！🐱🔊

---

**最后更新：** 2025-01-15
**固件版本：** 1.1.3-upload
**音频芯片：** 8002单声道功放
