# 搜索工具修复 - 更新日志

## 已完成的修复（2025-11-10 14:15）

### 1. 改进隐式工具调用提取逻辑 (`src/ai.ts:1066-1123`)

**问题**：gpt-oss-20b 模型输出的格式不是标准的 OpenAI function calling：
```
commentary to=functions.searchWeb <|constrain|>json<|message|>{"query":"..."...}
```

**修复**：扩展 `extractImplicitToolCallFromContent()` 支持两种格式：
1. **Pattern 1**: `commentary to=functions.toolName {json}` (Pro 模型格式)
2. **Pattern 2**: 直接的 JSON `{"tool": "...", "args": {...}}`

### 2. 添加详细调试日志 (`src/ai.ts:983-1002`)

添加日志输出：
- 成功提取工具调用时显示工具名和参数
- 失败时显示内容预览和模式匹配结果
- 帮助诊断为什么工具调用没有被识别

---

## 当前问题分析

从你的日志可以看到：

### ✅ 工具调用成功执行
```
[chat-stream] bh8fchn519t tool searchWeb -> success (394ms)
```

### ❌ 但模型没有识别到工具调用
第一次响应中，模型生成了：
```
commentary to=functions.searchWeb <|constrain|>json<|message|>{"query":"how to take care of cat","lang":"en","limit":5}
```

但被 `sanitizeModelResponse()` 清理掉了（Line 191）：
```typescript
.replace(/commentary to=functions\.[\s\S]*?(?:<\|call\|>commentary|$)/gi, '')
```

**根本原因**：清理函数太激进，在提取工具调用**之前**就把内容删掉了！

---

## 下一步修复

需要调整执行顺序：
1. 先提取工具调用（在 `executeModelCall` 中）✅ 已完成
2. 再清理响应文本（在 `sanitizeModelResponse` 中）

但 `sanitizeModelResponse` 在 `generateChatContent` 中被调用（Line 481），在工具调用提取之后。

问题可能在 `parseThinkingFromContent` 或其他地方提前清理了内容。

---

## 测试步骤

1. 重启后端：
   ```bash
   cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
   npm run dev
   ```

2. 在前端测试搜索：
   - 启用搜索
   - 切换到 Pro 模型
   - 问："請幫我上網查貓咪照護"

3. 查看后端日志中的 `[AI DEBUG]` 消息：
   - 应该看到 "Extracted implicit tool call"
   - 如果看到 "No implicit tool call found"，检查 contentPreview

---

## 语言问题

模型用英文回复，但应该用中文。这是因为：
- Pro 模型可能默认用英文
- 需要在系统提示中更强调语言

将在下一次修复中处理。

---

## 待修复
- [ ] 确认工具调用提取生效
- [ ] 修复语言问题（强制中文回复）
- [ ] 优化 `sanitizeModelResponse` 不要删除工具调用
