# 三大 AI 功能整合指南

## 🎯 已實作的功能

### 後端 (100% 完成)
- ✅ **knowledgeExtractor.ts** - 智能知識提取器
- ✅ **proactiveAssistant.ts** - 主動助理系統
- ✅ **Migration 014** - extracted_knowledge 表
- ✅ **Migration 015** - proactive_insights 表

### 前端 (100% 完成)
- ✅ **ContextVisualization.tsx** - 上下文視覺化組件
- ✅ **KnowledgeCards.tsx** - 知識卡片組件
- ✅ **ProactiveInsights.tsx** - 主動洞察組件

---

## 📝 整合步驟

### 步驟 1: 後端 API 端點整合

在 `smart-cat-backend/src/index.ts` 中添加以下內容:

#### 1.1 Import 新模組 (在文件頂部)

```typescript
import * as knowledgeExtractor from './knowledgeExtractor.js'
import * as proactiveAssistant from './proactiveAssistant.js'
```

#### 1.2 啟動主動助理 (在伺服器啟動時)

找到 `app.listen()` 的位置,在之前添加:

```typescript
// 啟動主動助理
proactiveAssistant.startProactiveAssistant()
console.log('[server] Proactive assistant started')
```

#### 1.3 新增 API 端點

在 `index.ts` 任意位置添加這些端點:

```typescript
// ==================== 知識提取 API ====================

// 手動提取知識
app.post('/api/knowledge/extract', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { messages, catId } = req.body

    if (!Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'Messages must be an array' })
    }

    // 使用 AI 提取知識
    const result = await knowledgeExtractor.extractKnowledgeWithAI(
      messages,
      catId || 'default',
      async (prompt) => {
        const chatResult = await generateChatContent({
          question: prompt,
          historyMessages: [],
          knowledgePrompt: '',
          personality: 'PhiLia093',
          modelConfig: { ...aiConfig.standard },
          provider: 'local',
          isDeveloper: false,
          enableSearch: false,
          language: 'zh'
        })
        return chatResult.text
      }
    )

    // 儲存知識
    for (const knowledge of result.knowledge) {
      knowledgeExtractor.saveKnowledge(knowledge)
    }

    res.json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[knowledge] Extract error:', error)
    res.status(500).json({ success: false, error: 'Failed to extract knowledge' })
  }
})

// 獲取知識列表
app.get('/api/knowledge', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : 'default'
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50

    const knowledge = knowledgeExtractor.getCatKnowledge(catId, limit)

    res.json({
      success: true,
      knowledge
    })
  } catch (error) {
    console.error('[knowledge] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list knowledge' })
  }
})

// 更新知識
app.patch('/api/knowledge/:id', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    const updates = req.body

    knowledgeExtractor.updateKnowledge(id, updates)

    res.json({ success: true })
  } catch (error) {
    console.error('[knowledge] Update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update knowledge' })
  }
})

// 刪除知識
app.delete('/api/knowledge/:id', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    knowledgeExtractor.deleteKnowledge(id)

    res.json({ success: true })
  } catch (error) {
    console.error('[knowledge] Delete error:', error)
    res.status(500).json({ success: false, error: 'Failed to delete knowledge' })
  }
})

// 知識統計
app.get('/api/knowledge/stats', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : undefined
    const stats = knowledgeExtractor.getKnowledgeStats(catId)

    res.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('[knowledge] Stats error:', error)
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})

// ==================== 主動洞察 API ====================

// 獲取活躍的洞察
app.get('/api/insights', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : undefined
    const insights = proactiveAssistant.getActiveInsights(catId)

    res.json({
      success: true,
      insights
    })
  } catch (error) {
    console.error('[insights] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list insights' })
  }
})

// 手動檢查洞察
app.post('/api/insights/check', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.body.catId === 'string' ? req.body.catId : undefined
    const result = await proactiveAssistant.checkProactiveInsights(catId)

    // 儲存新洞察
    for (const insight of result.insights) {
      proactiveAssistant.saveInsight(insight)
    }

    res.json({
      success: true,
      result
    })
  } catch (error) {
    console.error('[insights] Check error:', error)
    res.status(500).json({ success: false, error: 'Failed to check insights' })
  }
})

// 標記為已讀
app.post('/api/insights/:id/dismiss', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    proactiveAssistant.dismissInsight(id)

    res.json({ success: true })
  } catch (error) {
    console.error('[insights] Dismiss error:', error)
    res.status(500).json({ success: false, error: 'Failed to dismiss insight' })
  }
})
```

#### 1.4 修改 `/api/chat/suggestions` 添加上下文追蹤

找到 `generateChatContent` 的調用位置,在回傳結果時添加上下文資訊:

```typescript
// 在 generateChatContent 調用之後
const chatResult = await generateChatContent({...})

// 構建上下文來源
const contextSources = []

// 記憶上下文
if (memoriesUsed && memoriesUsed.length > 0) {
  contextSources.push({
    type: 'memory',
    title: `使用了 ${memoriesUsed.length} 條記憶`,
    snippet: memoriesUsed.map(m => m.content).join('; '),
    relevance: 0.9,
    timestamp: new Date()
  })
}

// 感測數據上下文
if (snapshot) {
  contextSources.push({
    type: 'sensor',
    title: '最新感測數據',
    snippet: `溫度 ${snapshot.temperature}°C, 濕度 ${snapshot.humidity}%, 貓咪存在: ${snapshot.catPresent ? '是' : '否'}`,
    relevance: 0.8,
    timestamp: new Date(snapshot.timestamp)
  })
}

// 圖像上下文
if (visionSummary) {
  contextSources.push({
    type: 'image',
    title: '圖像分析',
    snippet: visionSummary,
    relevance: 0.95,
    timestamp: new Date()
  })
}

// 工具上下文
if (chatResult.toolCall) {
  contextSources.push({
    type: 'tool',
    title: `執行了工具: ${chatResult.toolCall.tool}`,
    snippet: JSON.stringify(chatResult.toolCall.args),
    relevance: 1.0,
    timestamp: new Date()
  })
}

// 在回傳中加入 contextSources
res.json({
  text: chatResult.text,
  // ... 其他欄位
  contextSources  // 新增
})
```

---

### 步驟 2: 前端整合

#### 2.1 更新 backendClient.ts

在 `smart-cat-home/src/utils/backendClient.ts` 添加:

```typescript
// 知識 API
export interface KnowledgeItem {
  id: string
  type: 'fact' | 'habit' | 'health' | 'preference' | 'event'
  content: string
  confidence: number
  importance: 'low' | 'medium' | 'high'
  tags: string[]
  relatedDate?: string
  createdAt: string
  source: string
}

export async function fetchKnowledge(catId?: string, limit?: number) {
  const params = new URLSearchParams()
  if (catId) params.append('catId', catId)
  if (limit) params.append('limit', limit.toString())

  const response = await fetch(`${BASE_URL}/api/knowledge?${params}`, {
    headers: getAuthHeaders()
  })

  return response.json()
}

export async function updateKnowledge(id: string, updates: any) {
  const response = await fetch(`${BASE_URL}/api/knowledge/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(updates)
  })

  return response.json()
}

export async function deleteKnowledge(id: string) {
  const response = await fetch(`${BASE_URL}/api/knowledge/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  })

  return response.json()
}

// 洞察 API
export interface Insight {
  id: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  recommendation: string[]
  relatedData?: any
  createdAt: string
  expiresAt?: string
}

export async function fetchInsights(catId?: string) {
  const params = new URLSearchParams()
  if (catId) params.append('catId', catId)

  const response = await fetch(`${BASE_URL}/api/insights?${params}`, {
    headers: getAuthHeaders()
  })

  return response.json()
}

export async function dismissInsight(id: string) {
  const response = await fetch(`${BASE_URL}/api/insights/${id}/dismiss`, {
    method: 'POST',
    headers: getAuthHeaders()
  })

  return response.json()
}

// 修改 ChatSuggestionResponse 添加 contextSources
export interface ChatSuggestionResponse {
  text: string
  // ... 現有欄位
  contextSources?: Array<{
    type: string
    title: string
    snippet: string
    relevance: number
    timestamp?: string
  }>
}
```

#### 2.2 修改 AiChatPanel.tsx

在 `AiChatPanel` 組件中:

```typescript
import ContextVisualization from './ContextVisualization'
import KnowledgeCards from './KnowledgeCards'
import ProactiveInsights from './ProactiveInsights'
import { fetchKnowledge, updateKnowledge, deleteKnowledge, fetchInsights, dismissInsight } from '../utils/backendClient'

// 在組件內部添加狀態
const [contextSources, setContextSources] = useState([])
const [knowledge, setKnowledge] = useState([])
const [insights, setInsights] = useState([])

// 獲取知識和洞察
useEffect(() => {
  loadKnowledge()
  loadInsights()

  // 定期更新洞察
  const interval = setInterval(loadInsights, 60000) // 每分鐘
  return () => clearInterval(interval)
}, [selectedCatId])

const loadKnowledge = async () => {
  try {
    const result = await fetchKnowledge(selectedCatId)
    if (result.success) {
      setKnowledge(result.knowledge.map(k => ({
        ...k,
        createdAt: new Date(k.createdAt)
      })))
    }
  } catch (error) {
    console.error('Failed to load knowledge:', error)
  }
}

const loadInsights = async () => {
  try {
    const result = await fetchInsights(selectedCatId)
    if (result.success) {
      setInsights(result.insights.map(i => ({
        ...i,
        createdAt: new Date(i.createdAt),
        expiresAt: i.expiresAt ? new Date(i.expiresAt) : undefined
      })))
    }
  } catch (error) {
    console.error('Failed to load insights:', error)
  }
}

const handleDismissInsight = async (id: string) => {
  try {
    await dismissInsight(id)
    setInsights(prev => prev.filter(i => i.id !== id))
  } catch (error) {
    console.error('Failed to dismiss insight:', error)
  }
}

const handleEditKnowledge = async (id: string, updates: any) => {
  try {
    await updateKnowledge(id, updates)
    await loadKnowledge()
  } catch (error) {
    console.error('Failed to update knowledge:', error)
  }
}

const handleDeleteKnowledge = async (id: string) => {
  try {
    await deleteKnowledge(id)
    setKnowledge(prev => prev.filter(k => k.id !== id))
  } catch (error) {
    console.error('Failed to delete knowledge:', error)
  }
}

// 在接收 AI 回覆時更新上下文
const handleSendMessage = async () => {
  // ... 現有代碼

  const response = await fetchChatSuggestions(message, {...})

  if (response.contextSources) {
    setContextSources(response.contextSources.map(s => ({
      ...s,
      timestamp: s.timestamp ? new Date(s.timestamp) : undefined
    })))
  }

  // ... 其餘代碼
}

// 在 JSX 中添加組件
return (
  <div className="ai-chat-panel">
    {/* 主動洞察 (固定在頂部) */}
    <ProactiveInsights
      insights={insights}
      onDismiss={handleDismissInsight}
    />

    {/* 聊天消息 */}
    <div className="messages">
      {messages.map(msg => (
        <div key={msg.id}>
          {/* 消息內容 */}

          {/* AI 回覆後顯示上下文 */}
          {msg.role === 'assistant' && contextSources.length > 0 && (
            <ContextVisualization sources={contextSources} />
          )}
        </div>
      ))}
    </div>

    {/* 知識卡片 (側邊欄或可摺疊區域) */}
    <KnowledgeCards
      knowledge={knowledge}
      onEdit={handleEditKnowledge}
      onDelete={handleDeleteKnowledge}
      className="mt-4"
    />
  </div>
)
```

---

## 🎨 UI 佈局建議

### 選項 1: 垂直佈局
```
┌─────────────────────────────┐
│ 主動洞察 (頂部橫幅)          │
├─────────────────────────────┤
│ 聊天消息                     │
│ ├─ 使用者訊息                │
│ └─ AI 回覆                   │
│    └─ 上下文視覺化          │
├─────────────────────────────┤
│ 知識卡片 (可摺疊)            │
└─────────────────────────────┘
```

### 選項 2: 側邊欄佈局
```
┌─────────────┬───────────────┐
│ 主動洞察    │ 知識卡片      │
│ (緊急通知)  │              │
├─────────────┤              │
│ 聊天消息    │              │
│             │ (固定側邊欄) │
│             │              │
└─────────────┴───────────────┘
```

---

## 🧪 測試流程

### 1. 測試知識提取

```bash
# 啟動後端
cd smart-cat-backend
npm run build
npm start

# 檢查 migration
sqlite3 smart-cat-home.db "SELECT * FROM schema_migrations WHERE id LIKE '01%';"

# 應該看到:
# 014_knowledge_extraction
# 015_proactive_insights
```

### 2. 測試 API

```bash
# 測試知識提取
curl -X POST http://localhost:4000/api/knowledge/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "我的貓 Mimi 是橘貓,3歲"},
      {"role": "assistant", "content": "好的,我記住了"}
    ],
    "catId": "default"
  }'

# 查看知識
curl http://localhost:4000/api/knowledge?catId=default \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. 測試主動助理

主動助理會每 15 分鐘自動檢查。查看洞察:

```bash
curl http://localhost:4000/api/insights \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 效能優化建議

1. **知識去重**: 定期執行 `deduplicateKnowledge()`
2. **洞察清理**: 主動助理會自動清理過期洞察
3. **分頁載入**: 知識和洞察使用分頁,避免一次載入太多
4. **快取**: 前端快取知識和洞察,減少 API 調用

---

## 🎉 完成檢查清單

### 後端
- [ ] Import knowledgeExtractor 和 proactiveAssistant
- [ ] 啟動主動助理
- [ ] 新增知識 API 端點 (5 個)
- [ ] 新增洞察 API 端點 (3 個)
- [ ] 修改聊天 API 回傳 contextSources
- [ ] 測試 Migration 014 和 015 執行成功

### 前端
- [ ] 更新 backendClient.ts 添加 API 函數
- [ ] 在 AiChatPanel 中整合三個組件
- [ ] 實作知識載入和管理
- [ ] 實作洞察載入和關閉
- [ ] 實作上下文顯示
- [ ] 測試 UI 顯示正常

### 功能測試
- [ ] 對話後自動提取知識
- [ ] 知識卡片顯示和編輯
- [ ] 主動洞察定期檢查
- [ ] 緊急通知頂部橫幅顯示
- [ ] 上下文來源正確顯示

---

完成以上步驟後,您的三大 AI 功能將完全整合! 🚀
