# Pro Max Dual-Model System Implementation Guide

## 概述

Pro Max 系统通过并行调用 standard 和 pro 模型，实时比较质量并自动选择最佳响应。

## 已完成组件

### ✅ 1. proMaxManager.ts (385行)

**核心功能**：
- 并行模型调用
- Token级流式传输
- 质量评分算法（0-100分）
- 自动选择最佳响应

**质量评分因子**：
- 长度因子：50-500词最佳
- 结构因子：列表、标题加分
- 引用因子：有引用加10分
- 思考tokens：Pro模型优势（+15分）
- 多样性：避免重复（repetition惩罚-20分）
- 完整性：截断惩罚-15分

**主要API**：
```typescript
const manager = new ProMaxManager(standardConfig, proConfig)

await manager.invokeDual(
  { prompt, systemPrompt, temperature, maxTokens },
  {
    onStandardToken: (token, fullText) => { /* 逐token处理 */ },
    onProToken: (token, fullText) => { /* 逐token处理 */ },
    onBothComplete: (result) => {
      // result.selected = 'standard' | 'pro'
      // result.confidenceScore = 差异分数
    }
  },
  sseConnection  // 可选SSE连接
)
```

## 集成步骤

### Step 1: 初始化Pro Max Manager

在 `src/index.ts` 启动时：

```typescript
// 1. 添加导入
import {
  initializeProMaxManager,
  getProMaxManager,
} from './proMaxManager'

// 2. 在logStartup()中初始化
function logStartup(protocol: 'http' | 'https') {
  // ... 现有代码 ...

  // 🤖 Initialize Pro Max Manager
  initializeProMaxManager(
    aiConfig.standard,  // 标准模型配置
    aiConfig.pro        // Pro模型配置
  )
  console.log('[pro-max] Dual-model system ready')
}
```

### Step 2: 创建Pro Max端点

在 `src/index.ts` 添加新endpoint（约在5000行后）：

```typescript
/**
 * Pro Max Chat Endpoint
 * Invokes both standard and pro models in parallel
 */
app.post('/api/chat/pro-max', chatLimiter, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2)
  console.log(`[pro-max] ${requestId} start`)

  if (!requireAuthenticated(req, res)) return

  try {
    const manager = getProMaxManager()
    if (!manager) {
      res.status(503).json({ ok: false, message: 'Pro Max not initialized' })
      return
    }

    // 解析请求
    const {
      message,
      language = 'zh',
      systemPrompt,
      temperature,
      maxTokens,
    } = req.body

    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ ok: false, message: 'Invalid message' })
      return
    }

    // 检查是否SSE
    const acceptSSE = req.headers.accept?.includes('text/event-stream')

    if (acceptSSE) {
      // SSE模式：实时流式响应
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const sseConnection = globalSSEPool.createConnection(res, requestId)

      const state = {
        standard: { text: '', complete: false },
        pro: { text: '', complete: false },
      }

      await manager.invokeDual(
        {
          prompt: message,
          systemPrompt,
          temperature,
          maxTokens,
        },
        {
          onStandardToken: (token, fullText) => {
            state.standard.text = fullText
            sseConnection.send({
              type: 'token',
              data: { model: 'standard', token, fullText },
            })
          },
          onProToken: (token, fullText) => {
            state.pro.text = fullText
            sseConnection.send({
              type: 'token',
              data: { model: 'pro', token, fullText },
            })
          },
          onBothComplete: (result) => {
            sseConnection.send({
              type: 'done',
              data: {
                standard: result.standard,
                pro: result.pro,
                selected: result.selected,
                confidence: result.confidenceScore,
              },
            })
            sseConnection.close()
          },
          onError: (error, model) => {
            sseConnection.sendError(error.message, { model })
          },
        },
        sseConnection
      )
    } else {
      // 标准模式：等待完成后返回
      const result = await manager.invokeDual(
        {
          prompt: message,
          systemPrompt,
          temperature,
          maxTokens,
        },
        {
          // 非SSE模式不需要token处理
        }
      )

      res.json({
        ok: true,
        data: {
          standard: {
            text: result.standard.text,
            tokens: result.standard.tokens,
            durationMs: result.standard.durationMs,
          },
          pro: {
            text: result.pro.text,
            tokens: result.pro.tokens,
            durationMs: result.pro.durationMs,
          },
          selected: result.selected,
          confidence: result.confidenceScore,
        },
      })
    }
  } catch (error) {
    console.error(`[pro-max] ${requestId} error:`, error)
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Internal error',
    })
  }
})
```

### Step 3: 前端集成（可选）

创建 `src/hooks/useProMaxChat.ts`：

```typescript
import { useState, useCallback } from 'react'
import { sendSSEChatMessage } from '../utils/sseClient'

export interface ProMaxResponse {
  standard: { text: string; tokens: number; durationMs: number }
  pro: { text: string; tokens: number; durationMs: number }
  selected: 'standard' | 'pro'
  confidence: number
}

export function useProMaxChat() {
  const [standardText, setStandardText] = useState('')
  const [proText, setProText] = useState('')
  const [result, setResult] = useState<ProMaxResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const sendProMaxMessage = useCallback(async (message: string) => {
    setLoading(true)
    setStandardText('')
    setProText('')
    setResult(null)

    try {
      const client = await sendSSEChatMessage(
        '/api/chat/pro-max',
        { message },
        {
          onToken: (token, metadata) => {
            if (metadata.model === 'standard') {
              setStandardText(metadata.fullText)
            } else if (metadata.model === 'pro') {
              setProText(metadata.fullText)
            }
          },
          onDone: (finalData) => {
            setResult(finalData)
            setLoading(false)
          },
          onError: (error) => {
            console.error('[pro-max] Error:', error)
            setLoading(false)
          },
        }
      )
    } catch (error) {
      console.error('[pro-max] Failed to start:', error)
      setLoading(false)
    }
  }, [])

  return {
    standardText,
    proText,
    result,
    loading,
    sendProMaxMessage,
  }
}
```

创建 `src/components/ProMaxChatPanel.tsx`：

```typescript
import { useState } from 'react'
import { useProMaxChat } from '../hooks/useProMaxChat'
import './ProMaxChatPanel.css'

export function ProMaxChatPanel() {
  const [input, setInput] = useState('')
  const { standardText, proText, result, loading, sendProMaxMessage } = useProMaxChat()

  const handleSend = () => {
    if (!input.trim() || loading) return
    sendProMaxMessage(input)
    setInput('')
  }

  return (
    <div className="pro-max-panel">
      <h2>Pro Max 双模型对比</h2>

      <div className="pro-max-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入您的问题..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? '生成中...' : '发送'}
        </button>
      </div>

      <div className="pro-max-results">
        {/* Standard 模型 */}
        <div className="model-response">
          <h3>Standard 模型</h3>
          <div className="response-text">
            {standardText || (loading ? '生成中...' : '等待输入')}
          </div>
          {result && (
            <div className="response-meta">
              <span>{result.standard.tokens} tokens</span>
              <span>{result.standard.durationMs}ms</span>
            </div>
          )}
        </div>

        {/* Pro 模型 */}
        <div className="model-response">
          <h3>Pro 模型</h3>
          <div className="response-text">
            {proText || (loading ? '生成中...' : '等待输入')}
          </div>
          {result && (
            <div className="response-meta">
              <span>{result.pro.tokens} tokens</span>
              <span>{result.pro.durationMs}ms</span>
            </div>
          )}
        </div>
      </div>

      {/* 自动选择结果 */}
      {result && (
        <div className={`auto-selection auto-selection--${result.selected}`}>
          <strong>自动选择：</strong>
          {result.selected === 'standard' ? 'Standard 模型' : 'Pro 模型'}
          <span>（置信度：{result.confidence}）</span>
        </div>
      )}
    </div>
  )
}
```

## 测试方法

### 1. 命令行测试

```bash
# 非SSE模式
curl -X POST http://localhost:4000/api/chat/pro-max \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "解释什么是量子纠缠",
    "language": "zh"
  }'

# 响应示例：
{
  "ok": true,
  "data": {
    "standard": {
      "text": "量子纠缠是...",
      "tokens": 156,
      "durationMs": 2341
    },
    "pro": {
      "text": "量子纠缠（Quantum Entanglement）是...",
      "tokens": 287,
      "durationMs": 4102
    },
    "selected": "pro",
    "confidence": 23
  }
}
```

### 2. SSE模式测试

```bash
curl -X POST http://localhost:4000/api/chat/pro-max \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "什么是黑洞",
    "language": "zh"
  }'

# SSE事件流：
data: {"type":"token","data":{"model":"standard","token":"黑","fullText":"黑"}}
data: {"type":"token","data":{"model":"pro","token":"黑","fullText":"黑"}}
data: {"type":"token","data":{"model":"standard","token":"洞","fullText":"黑洞"}}
...
data: {"type":"done","data":{"selected":"pro","confidence":18}}
```

## 配置选项

在 `.env` 添加Pro Max配置：

```bash
# Pro Max 启用开关
ENABLE_PRO_MAX=true

# 自动选择阈值（置信度低于此值时使用Pro响应）
PRO_MAX_AUTO_SELECT_THRESHOLD=15

# 超时设置
PRO_MAX_TIMEOUT_MS=120000  # 2分钟
```

## 性能优化

1. **并行执行**：两个模型真正并行，无等待
2. **早停机制**：一个模型完成后立即显示，无需等待另一个
3. **流式传输**：Token级实时更新，用户体验流畅
4. **智能缓存**：相同prompt可复用结果（可选实现）

## 故障处理

- **单模型失败**：继续使用成功的模型响应
- **双模型失败**：返回友好错误信息
- **超时处理**：使用已生成的部分内容

## 未来扩展

1. **三模型对比**：Standard + Pro + Pro-Max（Thinking模式）
2. **用户投票**：让用户选择更好的响应，训练选择算法
3. **A/B测试**：收集质量评分数据优化算法
4. **模型路由**：根据问题类型智能选择调用模式
