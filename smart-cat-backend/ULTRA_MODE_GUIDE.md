# Ultra Mode 集成指南

## 🎯 功能概述

### 1. Ultra模式工作流程
```
用户问题
    ↓
Pro模型深度思考（无限制）
    ↓ 输出1
Standard模型审查
    ↓ 反馈
Pro模型整合反馈
    ↓ 最终输出
用户
```

### 2. 增强视觉分析
- 不限于猫和家庭环境
- 全面安全扫描（7类风险）
- 实时视频流分析
- 紧急警报自动触发

### 3. UI改进
- **移除**：搜索开关
- **新增**：Ultra模式按钮
- **优化**：显示thinking phase指示器
- **保留**：逐字流式输出

---

## 📝 后端集成

### Step 1: 初始化Ultra Manager

在 `src/index.ts` 的 `logStartup()` 函数中添加：

```typescript
// 现有代码...
import {
  initializeUltraManager,
  getUltraManager,
} from './ultraMode'

function logStartup(protocol: 'http' | 'https') {
  // ... 现有代码 ...

  // 🚀 Initialize Ultra Mode
  initializeUltraManager(
    aiConfig.pro,       // Pro配置
    aiConfig.standard   // Standard配置
  )
  console.log('[ultra] Dual-model collaborative system ready')
}
```

### Step 2: 创建Ultra Endpoint

在 `src/index.ts` 添加新endpoint（约5100行后）：

```typescript
/**
 * POST /api/chat/ultra
 * Ultra模式：双模型协作，无限制输出
 */
app.post('/api/chat/ultra', chatLimiter, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2)
  console.log(`[ultra] ${requestId} start`)

  if (!requireAuthenticated(req, res)) return

  try {
    const manager = getUltraManager()
    if (!manager) {
      res.status(503).json({ ok: false, message: 'Ultra mode not initialized' })
      return
    }

    const {
      message,
      language = 'zh',
      catId,
    } = req.body

    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ ok: false, message: 'Invalid message' })
      return
    }

    // 加载上下文
    const requestedCatId = catId || activeCatId
    const snapshot = latestSnapshotsByCat.get(requestedCatId) ?? loadLatestSnapshot(requestedCatId)
    const memories = loadRelevantMemories(message, 5)
    const history = loadHistory(10, requestedCatId)

    // 检查SSE
    const acceptSSE = req.headers.accept?.includes('text/event-stream')

    if (acceptSSE) {
      // SSE模式
      const sseConnection = globalSSEPool.createConnection(res, requestId)

      const result = await manager.execute(
        {
          prompt: message,
          language: language as 'zh' | 'en',
          context: { snapshot, memories, history },
        },
        (phase) => {
          // Phase updates自动通过sseConnection发送
        },
        sseConnection
      )

      // 发送最终结果
      sseConnection.send({
        type: 'done',
        data: {
          phases: result.phases,
          proFirstOutput: result.proFirstOutput,
          standardReview: result.standardReview,
          proFinalOutput: result.proFinalOutput,
          totalDurationMs: result.totalDurationMs,
          totalTokens: result.totalTokens,
        },
      })

      sseConnection.close()
    } else {
      // 标准JSON响应
      const result = await manager.execute({
        prompt: message,
        language: language as 'zh' | 'en',
        context: { snapshot, memories, history },
      })

      res.json({
        ok: true,
        data: {
          text: result.proFinalOutput.text,
          phases: result.phases.map(p => ({
            phase: p.phase,
            description: p.description,
          })),
          metadata: {
            totalTokens: result.totalTokens,
            totalDurationMs: result.totalDurationMs,
            proFirstTokens: result.proFirstOutput.outputTokens,
            proFinalTokens: result.proFinalOutput.outputTokens,
            reviewConcerns: result.standardReview.concerns,
          },
        },
      })
    }
  } catch (error) {
    console.error(`[ultra] ${requestId} error:`, error)
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Internal error',
    })
  }
})
```

### Step 3: 集成增强视觉（可选）

> 當 `analyzeImage` 需要更嚴格的安全評分時，可將輸出交給 `enhancedVision` 模組進行再次判讀，並依需求觸發高優先警報。

---

## 🎨 前端集成

### Step 1: 创建Ultra模式Hook

创建 `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/hooks/useUltraChat.ts`：

```typescript
import { useState, useCallback } from 'react'
import { sendSSEChatMessage } from '../utils/sseClient'
import type { LanguageCode } from '../i18n/translations'

export type UltraPhase = 'pro_thinking' | 'pro_output' | 'standard_review' | 'pro_rethink' | 'final_output'

export interface UltraPhaseInfo {
  phase: UltraPhase
  description: string
  timestamp: number
}

export function useUltraChat(language: LanguageCode) {
  const [currentPhase, setCurrentPhase] = useState<UltraPhase | null>(null)
  const [phases, setPhases] = useState<UltraPhaseInfo[]>([])
  const [proFirstText, setProFirstText] = useState('')
  const [proFinalText, setProFinalText] = useState('')
  const [reviewConcerns, setReviewConcerns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendUltraMessage = useCallback(async (message: string, catId?: string) => {
    setLoading(true)
    setError(null)
    setCurrentPhase(null)
    setPhases([])
    setProFirstText('')
    setProFinalText('')
    setReviewConcerns([])

    try {
      const client = await sendSSEChatMessage(
        '/api/chat/ultra',
        { message, language, catId },
        {
          onPhase: (phase, details) => {
            setCurrentPhase(phase as UltraPhase)
            if (details?.description) {
              setPhases(prev => [...prev, {
                phase: phase as UltraPhase,
                description: details.description,
                timestamp: Date.now(),
              }])
            }
          },
          onToken: (token, metadata) => {
            if (metadata?.phase === 'first') {
              setProFirstText(prev => prev + token)
            } else if (metadata?.phase === 'final') {
              setProFinalText(prev => prev + token)
            }
          },
          onDone: (finalData) => {
            if (finalData.standardReview?.concerns) {
              setReviewConcerns(finalData.standardReview.concerns)
            }
            setLoading(false)
            setCurrentPhase(null)
          },
          onError: (error) => {
            setError(error.message || 'Unknown error')
            setLoading(false)
            setCurrentPhase(null)
          },
        }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Ultra mode')
      setLoading(false)
    }
  }, [language])

  return {
    currentPhase,
    phases,
    proFirstText,
    proFinalText,
    reviewConcerns,
    loading,
    error,
    sendUltraMessage,
  }
}
```

### Step 2: UI改进 - 移除搜索开关

在 `AiChatPanel.tsx` 中：

```typescript
// 找到搜索开关相关代码并删除
// 搜索: enableSearch, searchToggle, 等关键词

// 删除这些部分：
- const [enableSearch, setEnableSearch] = useState(false)
- <label>
    <input type="checkbox" checked={enableSearch} onChange={...} />
    启用网络搜索
  </label>

// 搜索功能改由模型自主决定（在后端已实现detectSearchIntent）
```

### Step 3: 添加Ultra按钮

在 `AiChatPanel.tsx` 的输入框旁边添加：

```typescript
<div className="ai-chat__input-actions">
  <button
    type="button"
    className="btn btn--primary"
    onClick={handleSend}
    disabled={loading || !input.trim()}
  >
    {loading ? '发送中...' : '发送'}
  </button>

  {/* 新增：Ultra模式按钮 */}
  <button
    type="button"
    className="btn btn--ultra"
    onClick={handleUltraSend}
    disabled={loading || !input.trim()}
    title="Ultra模式：双模型协作，无限制深度思考"
  >
    ⚡ Ultra
  </button>
</div>
```

添加CSS样式：

```css
/* 在 AiChatPanel.css 中 */
.btn--ultra {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn--ultra:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn--ultra:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

### Step 4: 显示Thinking Phase

创建 `UltraPhaseIndicator.tsx`：

```typescript
import './UltraPhaseIndicator.css'

interface Props {
  phase: 'pro_thinking' | 'pro_output' | 'standard_review' | 'pro_rethink' | 'final_output' | null
  description?: string
}

const PHASE_LABELS = {
  pro_thinking: { zh: '🧠 Pro模型深度思考中...', en: '🧠 Pro Model Deep Thinking...' },
  pro_output: { zh: '📝 Pro模型输出中...', en: '📝 Pro Model Outputting...' },
  standard_review: { zh: '🔍 Standard模型审查中...', en: '🔍 Standard Model Reviewing...' },
  pro_rethink: { zh: '💡 Pro模型整合反馈...', en: '💡 Pro Model Integrating Feedback...' },
  final_output: { zh: '✅ 最终输出生成中...', en: '✅ Final Output Generating...' },
}

export function UltraPhaseIndicator({ phase, description }: Props) {
  if (!phase) return null

  const label = PHASE_LABELS[phase]

  return (
    <div className="ultra-phase">
      <div className="ultra-phase__spinner"></div>
      <div className="ultra-phase__text">
        <strong>{label.zh}</strong>
        {description && <p>{description}</p>}
      </div>
    </div>
  )
}
```

CSS动画：

```css
/* UltraPhaseIndicator.css */
.ultra-phase {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border-radius: 8px;
  margin-bottom: 1rem;
  animation: fadeIn 0.3s ease;
}

.ultra-phase__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(102, 126, 234, 0.3);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.ultra-phase__text strong {
  color: #667eea;
  font-size: 1rem;
}

.ultra-phase__text p {
  margin: 0.25rem 0 0;
  color: #666;
  font-size: 0.875rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## 🧪 测试方法

### 1. Ultra模式测试

```bash
curl -X POST http://localhost:4000/api/chat/ultra \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "分析我家猫咪最近的行为变化，提供详细的健康评估和改进建议",
    "language": "zh"
  }'

# 预期SSE事件流：
# phase: pro_thinking
# token: (Pro模型输出)
# phase: standard_review
# phase: pro_rethink
# token: (Pro最终输出)
# done: (完整结果)
```

### 2. 增强视觉测试

```bash
curl -X POST http://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "message": "分析这张图片",
    "imageUrl": "https://example.com/kitchen-scene.jpg",
    "language": "zh",
    "messages": [
      {
        "role": "user",
        "content": "分析图片安全性",
        "imageUrl": "https://example.com/kitchen-scene.jpg"
      }
    ]
  }'

# 预期：
# - 检测所有物体（不限于猫）
# - 识别安全隐患（如开火炉、尖锐物等）
# - safetyScore评分
# - 紧急警报（如有critical hazards）
```

---

## 📊 性能参数

### Ultra模式
- **Pro First**: ~5-15秒（取决于thinking时间）
- **Review**: ~2-3秒（Standard模型快速审查）
- **Pro Rethink**: ~5-10秒
- **Total**: ~15-30秒（比单次调用慢，但质量显著提升）

### 增强视觉
- **分析时间**: ~2-4秒
- **紧急警报延迟**: <500ms（触发后立即dispatch）
- **支持格式**: JPEG, PNG, WebP
- **最大图片**: 10MB（建议压缩）

---

## 🎯 用户体验优化

### 1. Progressive Enhancement
- 保留标准聊天模式（快速响应）
- Ultra按钮可选（深度思考）
- 自动选择：复杂问题建议使用Ultra

### 2. 实时反馈
- Thinking phase显示（用户知道AI在做什么）
- Token级streaming（流畅打字效果）
- Phase进度条（可选）

### 3. 透明度
- 显示review concerns（让用户看到审查过程）
- 显示token消耗（Ultra模式成本较高）
- 允许中断（长时间思考可取消）

---

## 🔧 配置选项

在 `.env` 添加：

```bash
# Ultra模式配置
ENABLE_ULTRA_MODE=true

# Pro模型无限制配置
ULTRA_PRO_MAX_TOKENS=65536
ULTRA_PRO_ENABLE_THINKING=true
ULTRA_PRO_TEMPERATURE=1.0

# 增强视觉配置
VISION_ENABLE_ENHANCED=true
VISION_SAFETY_ALERT_THRESHOLD=7  # safetyScore ≤ 此值触发警报
VISION_AUTO_ANALYZE_VIDEO=false  # 视频流自动分析（实验性）
```
