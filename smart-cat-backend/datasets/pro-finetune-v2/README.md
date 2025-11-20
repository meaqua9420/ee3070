# Smart Cat Pro Fine-Tune Dataset v2

## 🎯 设计理念

此数据集专为训练 **Pro-tier 推理模型**而设计，解决了 v1 版本的关键问题：

### ❌ V1 版本的问题
1. **Thinking 质量低下**: 模板化套话，缺乏真实推理过程
2. **幻觉严重**: 模型虚构传感器数据而非基于真实输入
3. **数据规模不足**: 558 个样本，缺乏多样性
4. **推理能力缺失**: 无法展示 "Full chain-of-thought"

### ✅ V2 版本的改进

#### 1. 高质量 Thinking 标准
每个 thinking 必须包含：
- **问题理解**: 用户真正关心什么？
- **数据验证**: 检查传感器数据的可信度
- **推理步骤**: 从数据到结论的完整推导
- **方案比较**: 多个方案的优缺点分析（复杂场景）
- **风险评估**: 潜在问题和缓解措施
- **后续行动**: 监控点和验证方法

#### 2. 数据真实性保证
- System message **必须**包含完整的 `SmartHomeSnapshot` 数据
- Assistant 引用的所有数值**必须**来自 system 提供的数据
- 历史趋势数据明确列出，不允许虚构

#### 3. 场景分类体系
```
1. 环境监控 (Environment Monitoring)
   - 湿度/温度异常
   - 空气质量问题
   - 光照调节

2. 健康追踪 (Health Tracking)
   - 饮水不足
   - 体重变化
   - 喂食时间分析

3. 行为分析 (Behavior Analysis)
   - 猫咪冲突
   - 异常行为
   - 活动模式识别

4. 预防性维护 (Preventive Maintenance)
   - 传感器校准
   - 设备诊断
   - 系统优化

5. 紧急处理 (Emergency Response)
   - 健康紧急情况
   - 设备故障
   - 安全告警
```

#### 4. 双语平衡
- 中文样本: 50%
- 英文样本: 50%
- 每个场景都有中英文对应版本

---

## 📁 文件结构

```
pro-finetune-v2/
├── README.md (本文件)
├── templates/ (黄金标准样本)
│   ├── 01_environment_monitoring.jsonl
│   ├── 02_health_tracking.jsonl
│   ├── 03_behavior_analysis.jsonl
│   ├── 04_maintenance.jsonl
│   └── 05_emergency.jsonl
├── generated/ (基于模板生成的变体)
│   ├── environment_variants_zh.jsonl
│   ├── environment_variants_en.jsonl
│   └── ...
├── train.jsonl (训练集, 80%)
├── valid.jsonl (验证集, 10%)
└── test.jsonl (测试集, 10%)
```

---

## 🔍 质量标准

### Thinking 长度要求
- **最小长度**: 150 字符（简单场景）
- **推荐长度**: 300-600 字符（常规场景）
- **复杂场景**: 600-1200 字符（紧急/多变量决策）

### 禁止内容
❌ 不允许的 thinking 模式：
```json
{
  "thinking": "回顾提问：「[复制用户问题]...」。先快速整理使用者提问..."
}
```

✅ 正确的 thinking 示例：
```json
{
  "thinking": "<think>\n1. 数据分析：当前湿度 75.2%，连续 5 小时超过目标 60%\n2. 趋势判断：露点 19.9°C 表示高含水量，可能导致冷凝\n3. 行为关联：猫咪缩在门缝可能感到冷风不适\n4. 方案评估：\n   - 立即强力除湿：快速但耗能高\n   - 循环扇+温和除湿：平衡方案\n5. 决策：选择平衡方案，45分钟后检查\n6. 风险点：需监控湿度变化和猫咪位置\n</think>"
}
```

### 数据一致性检查
运行质量验证脚本：
```bash
node scripts/validate-dataset-v2.mjs
```

检查项目：
- ✅ System message 包含完整传感器数据
- ✅ Assistant 数值引用与 system 数据一致
- ✅ Thinking 长度符合标准
- ✅ 无模板化套话

---

## 🚀 使用指南

### 训练新模型
```bash
# 生成数据集
node scripts/generate-dataset-v2.mjs

# 验证质量
node scripts/validate-dataset-v2.mjs

# 使用 Nexa/MLX 训练
mlx_lm.lora \
  --model NexaAIDev/Qwen2.5-Coder-7B-Instruct \
  --train \
  --data datasets/pro-finetune-v2 \
  --iters 1000 \
  --learning-rate 1e-5 \
  --batch-size 2
```

### 更新后端配置
```env
LOCAL_LLM_PRO_MODEL_ID=smart-cat-pro-v2
LOCAL_LLM_PRO_ENABLE_THINKING=true
```

---

## 📊 数据集统计

- **目标样本数**: 200-500
- **场景类型**: 5 大类
- **语言分布**: 中英各 50%
- **Train/Valid/Test**: 80% / 10% / 10%

---

## 🔄 版本历史

- **v2.0** (2025-01-04): 全面重构，高质量 thinking，数据真实性保证
- **v1.0** (2025-01-11): 初始版本（已废弃）
