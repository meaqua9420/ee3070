/*
 * 8002音频模块测试程序
 *
 * 功能：
 * - 自动测试8002音频功放模块
 * - 播放测试音频序列
 * - 验证SD引脚控制和PWM音频输出
 *
 * 接线：
 * - Arduino D10 → 8002 SD (Shutdown)
 * - Arduino D11 → 8002 IN+ (Audio Input)
 * - 8002 IN- → GND
 * - 8002 VCC → 5V
 * - 8002 GND → GND
 * - 8002 OUT+/OUT- → 喇叭
 *
 * 作者：Claude Code
 * 日期：2025-01-15
 */

// 引脚定义
const uint8_t AUDIO_SD_PIN = 10;      // 8002的SD (Shutdown)引脚
const uint8_t AUDIO_SIGNAL_PIN = 11;  // 8002的IN+ (音频信号)引脚

// 测试音序列（频率Hz, 持续时间ms）
struct ToneStep {
  uint16_t frequency;
  uint16_t duration;
};

// 测试音阶：Do Re Mi Fa Sol La Si Do
const ToneStep TEST_SCALE[] = {
  {262, 500},  // C4 (Do)
  {294, 500},  // D4 (Re)
  {330, 500},  // E4 (Mi)
  {349, 500},  // F4 (Fa)
  {392, 500},  // G4 (Sol)
  {440, 500},  // A4 (La)
  {494, 500},  // B4 (Si)
  {523, 500},  // C5 (Do)
  {0, 0}       // 结束标记
};

// 猫咪呼唤音（上升音阶，吸引注意）
const ToneStep CAT_CALL[] = {
  {622, 220},
  {784, 280},
  {0, 120},    // 静音间隔
  {932, 260},
  {1047, 360},
  {0, 0}
};

// 安抚音（平缓舒缓）
const ToneStep CALM_TONE[] = {
  {440, 600},  // A4
  {494, 600},  // B4
  {523, 600},  // C5
  {0, 300},
  {494, 600},
  {440, 600},
  {0, 0}
};

void setup() {
  // 初始化串口
  Serial.begin(115200);
  while (!Serial) {
    ; // 等待串口连接（仅Leonardo/Micro需要）
  }

  Serial.println(F("================================="));
  Serial.println(F("  8002 Audio Module Test"));
  Serial.println(F("  音频模块测试程序"));
  Serial.println(F("================================="));
  Serial.println();

  // 配置引脚
  pinMode(AUDIO_SD_PIN, OUTPUT);
  pinMode(AUDIO_SIGNAL_PIN, OUTPUT);

  // 初始状态：关闭8002（SD引脚LOW）
  digitalWrite(AUDIO_SD_PIN, LOW);
  digitalWrite(AUDIO_SIGNAL_PIN, LOW);

  Serial.println(F("✓ 引脚初始化完成"));
  Serial.print(F("  - SD引脚 (D"));
  Serial.print(AUDIO_SD_PIN);
  Serial.println(F(")"));
  Serial.print(F("  - Signal引脚 (D"));
  Serial.print(AUDIO_SIGNAL_PIN);
  Serial.println(F(")"));
  Serial.println();

  delay(1000);

  // 开始测试
  runTests();
}

void loop() {
  // 测试完成后，等待用户重启
  Serial.println(F("\n按下Arduino复位键重新测试..."));
  delay(5000);
}

void runTests() {
  Serial.println(F("┌─────────────────────────────┐"));
  Serial.println(F("│  开始音频模块测试序列       │"));
  Serial.println(F("└─────────────────────────────┘"));
  Serial.println();

  // 测试1：SD引脚控制
  test1_SDControl();
  delay(2000);

  // 测试2：基础音调（单音）
  test2_SingleTone();
  delay(2000);

  // 测试3：音阶序列
  test3_ScaleSequence();
  delay(2000);

  // 测试4：猫咪呼唤音
  test4_CatCall();
  delay(2000);

  // 测试5：安抚音
  test5_CalmTone();
  delay(2000);

  Serial.println(F("\n✅ 所有测试完成！"));
  Serial.println(F("\n如果你听到了所有测试音，说明8002模块工作正常。"));
  Serial.println(F("如果没有声音，请检查接线和喇叭连接。"));
}

// 测试1：SD引脚控制测试
void test1_SDControl() {
  Serial.println(F("【测试1】SD引脚控制测试"));
  Serial.println(F("  功能：验证Shutdown引脚可以开关音频"));
  Serial.println();

  // 启用8002
  Serial.println(F("  → 启用8002芯片 (SD=HIGH)"));
  digitalWrite(AUDIO_SD_PIN, HIGH);
  delay(500);

  // 发送440Hz测试音
  Serial.println(F("  → 播放440Hz测试音（5秒）"));
  tone(AUDIO_SIGNAL_PIN, 440);
  delay(5000);

  // 关闭8002
  Serial.println(F("  → 关闭8002芯片 (SD=LOW)"));
  noTone(AUDIO_SIGNAL_PIN);
  digitalWrite(AUDIO_SD_PIN, LOW);
  delay(500);

  Serial.println(F("  ✓ SD控制测试完成\n"));
}

// 测试2：单音测试
void test2_SingleTone() {
  Serial.println(F("【测试2】单音频率测试"));
  Serial.println(F("  功能：播放不同频率验证音质"));
  Serial.println();

  digitalWrite(AUDIO_SD_PIN, HIGH);

  const uint16_t testFreqs[] = {262, 440, 880, 1568};
  const char* notes[] = {"C4 (Do)", "A4 (La)", "A5", "G6"};

  for (int i = 0; i < 4; i++) {
    Serial.print(F("  → 播放 "));
    Serial.print(testFreqs[i]);
    Serial.print(F("Hz ("));
    Serial.print(notes[i]);
    Serial.println(F(")"));

    tone(AUDIO_SIGNAL_PIN, testFreqs[i]);
    delay(1000);
    noTone(AUDIO_SIGNAL_PIN);
    delay(300);
  }

  digitalWrite(AUDIO_SD_PIN, LOW);
  Serial.println(F("  ✓ 单音测试完成\n"));
}

// 测试3：音阶序列
void test3_ScaleSequence() {
  Serial.println(F("【测试3】音阶序列测试 (Do-Re-Mi-Fa-Sol-La-Si-Do)"));
  Serial.println(F("  功能：验证连续音调切换"));
  Serial.println();

  playSequence(TEST_SCALE);

  Serial.println(F("  ✓ 音阶测试完成\n"));
}

// 测试4：猫咪呼唤音
void test4_CatCall() {
  Serial.println(F("【测试4】猫咪呼唤音测试"));
  Serial.println(F("  功能：播放吸引猫咪注意的声音"));
  Serial.println();

  Serial.println(F("  → 播放呼唤序列..."));
  playSequence(CAT_CALL);

  Serial.println(F("  ✓ 呼唤音测试完成\n"));
}

// 测试5：安抚音
void test5_CalmTone() {
  Serial.println(F("【测试5】安抚音测试"));
  Serial.println(F("  功能：播放舒缓放松的声音"));
  Serial.println();

  Serial.println(F("  → 播放安抚序列..."));
  playSequence(CALM_TONE);

  Serial.println(F("  ✓ 安抚音测试完成\n"));
}

// 播放音频序列的辅助函数
void playSequence(const ToneStep* sequence) {
  digitalWrite(AUDIO_SD_PIN, HIGH);  // 启用8002

  for (int i = 0; sequence[i].duration != 0; i++) {
    if (sequence[i].frequency == 0) {
      // 静音间隔
      noTone(AUDIO_SIGNAL_PIN);
    } else {
      // 播放音调
      tone(AUDIO_SIGNAL_PIN, sequence[i].frequency);
    }
    delay(sequence[i].duration);
  }

  noTone(AUDIO_SIGNAL_PIN);
  digitalWrite(AUDIO_SD_PIN, LOW);  // 关闭8002
}
