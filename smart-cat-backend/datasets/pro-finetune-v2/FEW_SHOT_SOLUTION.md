## Smart Cat Pro v2 - Few-Shot Learning 方案

### 概述
由于 MLX 训练遇到问题，我们采用 Few-Shot Learning 方法，将高质量训练样本直接注入到 system prompt 中。

### 实施步骤

#### 1. 提取最佳样本作为 Few-Shot Examples

从 v2 数据集中选取 3-5 个最佳样本，作为示例注入到 system prompt。

在 `src/ai.ts` 的 `buildSystemPrompt()` 函数中添加：

```typescript
const fewShotExamples = language === 'zh'
  ? `
📚 Professional Reasoning Examples:

Example 1: 湿度控制
User: 過去 5 小時濕度都卡在 73～76%，露點 19.9°C
Thinking: <think>
1. 数据分析：5小时内湿度从 73.3% 上升至 76.2%，平均 75.0%
2. 与目标对比：75.0% vs 60% 目标，超标 15 个百分点
3. 风险评估：露点 19.9°C 可能导致冷凝
4. 方案评估：
   - 方案A: 立即强力除湿（快但耗能）
   - 方案B: 循环扇+温和除湿（平衡，推荐）
5. 决策：选择方案B，45分钟后检查
</think>

Example 2: 健康监测
User: 米香今天喝水只有 136 ml，还要点眼药水
Thinking: <think>
1. 数据验证：136 ml / 240 ml target = 56.7%（严重不足）
2. 趋势分析：过去7天从 225ml 降至 136ml（下降 39.6%）
3. 风险等级：中等（单日不足但未急性症状）
4. 医疗阈值：连续3天 < 180ml 触发兽医咨询
5. 干预计划：20:10 提醒补水，20分钟后检查流量
</think>

当处理复杂问题时，请模仿以上示例的推理深度和结构。
  `
  : `
📚 Professional Reasoning Examples:

Example 1: Temperature Control
User: Temperature dropped from 25°C to 22.8°C. Cat is hiding.
Thinking: <think>
1. Data validation: 25.1°C → 24.2°C → 23.5°C → 22.8°C (consistent 0.8°C/hour drop)
2. Comfort assessment: 22.8°C is below typical cat comfort range (23-26°C)
3. Behavior correlation: hiding + minimal movement = seeking warmth
4. Root cause: Evening cooling + auto-mode failure
5. Solution: Gradual warm-up to 24°C over 30 min
6. Monitoring: Cat behavior as feedback indicator
</think>

Example 2: Health Monitoring
User: Poppy lost 0.38 kg this week, activity up 18%
Thinking: <think>
1. Weight analysis: 4.80 → 4.42 kg = 7.9% loss (exceeds 5% threshold)
2. Caloric math: 26 min extra activity ≈ 140 cal burned
3. Weight loss energy: 0.38 kg ≈ 2,800 cal deficit
4. Discrepancy: Activity + feeding deficit = 385 cal, but loss suggests 2,800 cal
5. Differential: Possible metabolic issue, not purely activity-related
6. Action plan: Increase intake, monitor 3-day average, vet if continues
</think>

Follow this depth of reasoning for complex scenarios.
  `

// 在 system prompt assembly 中加入
return \`\${base}

\${fewShotExamples}

\${thinkingGuide}
...\`
```

#### 2. 强化 Developer Mode Prompt

确保 `DEVELOPER_THINKING_PROMPT_ENABLED=true` 在 `.env` 中启用。

#### 3. 测试效果

```bash
# 重启backend
npm start

# 测试中文场景
npm run chat:smoke

# 或使用 curl 测试
curl -X POST http://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "message": "米香今天喝水只有 136 ml",
    "language": "zh"
  }'
```

### 预期效果

- ✅ Thinking 质量提升（通过示例引导）
- ✅ 数据引用更准确（示例展示如何使用真实数据）
- ✅ 推理结构化（模仿示例的步骤化思考）
- ⚠️  效果略低于 fine-tuning，但可立即使用

### 优势

1. **无需训练**: 立即可用
2. **灵活调整**: 随时更换示例
3. **成本低**: 不消耗训练资源
4. **兼容现有系统**: 直接集成到 gpt-oss server

### 后续优化

如果效果不理想，可以：
1. 增加 few-shot examples 数量 (3 → 5个)
2. 调整 system prompt 的指令强度
3. 修复 MLX 后进行真正的 fine-tuning

---

## 实施代码（立即可用）

我已经准备好了修改后的 `src/ai.ts`，是否要我帮你实施这个方案？
