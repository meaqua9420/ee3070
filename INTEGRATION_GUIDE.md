# 整合指南：多檔案上傳到 AI 聊天系統

## 📚 背景

您的 Smart Cat Home 專案已經實作了完整的檔案處理基礎設施:
- ✅ 5 個分析器模組 (fileHandler, pdfParser, audioAnalyzer, videoProcessor)
- ✅ 資料庫表 (file_uploads)
- ✅ 前端類型定義 (files.ts)

現在需要將這些模組整合到現有的聊天系統中。

---

## 🔧 後端整合步驟

### 步驟 1: 在 `index.ts` 頂部 import 新模組

```typescript
// 在現有 imports 後面新增
import * as fileHandler from './fileHandler.js'
import { analyzePDF, generatePDFSummary } from './pdfParser.js'
import { analyzeAudioWithAI, generateAudioSummary } from './audioAnalyzer.js'
import { analyzeVideoWithAI, generateVideoSummary } from './videoProcessor.js'
import { analyzeImageWithQwen } from './ai.js'  // 已存在
```

### 步驟 2: 確保上傳目錄初始化

在 `index.ts` 的伺服器啟動部分 (搜尋 `app.listen`):

```typescript
// 在 app.listen() 之前加入
await fileHandler.ensureUploadDir()
console.log('[server] Upload directories initialized')
```

### 步驟 3: 修改 `/api/chat/suggestions` 端點

找到這行程式碼 (約 4876 行):
```typescript
app.post('/api/chat/suggestions', chatLimiter, async (req, res) => {
```

在接收參數的部分 (約 4950 行,處理 `imageAttachments` 的地方),新增:

```typescript
// 現有的 imageAttachments 處理
const imageAttachments: Array<{
  data: string
  mimeType: string
  filename?: string
}> = req.body?.imageAttachments ?? []

// 新增: 其他檔案類型
const fileAttachments: Array<{
  data: string        // Base64
  mimeType: string
  filename: string
  description?: string // 使用者對檔案的描述
}> = req.body?.fileAttachments ?? []
```

### 步驟 4: 處理檔案並生成摘要

在圖像分析之後 (約 5039 行),新增檔案處理邏輯:

```typescript
// 在 imageAttachments 處理後
let fileAnalysisSummaries: string[] = []

if (fileAttachments.length > 0) {
  console.log(`[chat] Processing ${fileAttachments.length} file attachment(s)`)

  for (const attachment of fileAttachments) {
    try {
      // 1. 解析並儲存檔案
      const parsedFile = fileHandler.parseBase64File(
        attachment.data,
        attachment.filename
      )

      const metadata = await fileHandler.saveFile(
        parsedFile,
        req.authUser.username,
        catId
      )

      // 2. 根據檔案類型進行分析
      let analysis: any
      let summary: string

      switch (metadata.fileType) {
        case 'pdf': {
          // PDF 分析
          analysis = await analyzePDF(
            metadata.id,
            (prompt) => generateChatContent({
              question: prompt,
              historyMessages: [],
              knowledgePrompt: '',
              personality: 'PhiLia093',
              modelConfig: { ...currentModelConfig },
              provider: 'local',
              isDeveloper: false,
              enableSearch: false,
              language: resolvedLanguage
            }).then(r => r.text)
          )

          summary = generatePDFSummary(analysis)
          break
        }

        case 'audio': {
          // 音訊分析
          analysis = await analyzeAudioWithAI(
            metadata.id,
            attachment.description || '使用者上傳的貓叫聲音訊',
            (prompt) => generateChatContent({
              question: prompt,
              historyMessages: [],
              knowledgePrompt: '',
              personality: 'PhiLia093',
              modelConfig: { ...currentModelConfig },
              provider: 'local',
              isDeveloper: false,
              enableSearch: false,
              language: resolvedLanguage
            }).then(r => r.text)
          )

          summary = generateAudioSummary(analysis)
          break
        }

        case 'video': {
          // 影片分析
          analysis = await analyzeVideoWithAI(
            metadata.id,
            attachment.description || '使用者上傳的貓咪行為影片',
            (prompt) => generateChatContent({
              question: prompt,
              historyMessages: [],
              knowledgePrompt: '',
              personality: 'PhiLia093',
              modelConfig: { ...currentModelConfig },
              provider: 'local',
              isDeveloper: false,
              enableSearch: false,
              language: resolvedLanguage
            }).then(r => r.text)
          )

          summary = generateVideoSummary(analysis)
          break
        }

        case 'image': {
          // 圖片分析 (使用現有的視覺分析)
          const buffer = await fileHandler.readFile(metadata.id)
          const base64 = `data:${metadata.mimeType};base64,${buffer.toString('base64')}`

          const visionResult = await analyzeImageWithQwen(
            base64,
            attachment.filename,
            { enableCatDetection: true, enableSafetyCheck: true }
          )

          summary = visionResult.summary
          analysis = { imageAnalysis: visionResult }
          break
        }

        default: {
          summary = `已接收檔案: ${attachment.filename} (${metadata.fileType})`
        }
      }

      // 3. 儲存分析結果
      if (analysis) {
        fileHandler.updateAnalysisResult(metadata.id, analysis)
      }

      // 4. 加入摘要
      fileAnalysisSummaries.push(`📎 ${attachment.filename}:\n${summary}`)

    } catch (error) {
      console.error(`[chat] File analysis error for ${attachment.filename}:`, error)
      fileAnalysisSummaries.push(
        `⚠️ ${attachment.filename}: 分析失敗 - ${error instanceof Error ? error.message : '未知錯誤'}`
      )
    }
  }
}
```

### 步驟 5: 將檔案摘要加入對話上下文

找到構建 `userQuestion` 的地方 (約 5080 行),修改為:

```typescript
let userQuestion = cleanedMessage.trim()

// 加入圖像摘要 (現有)
if (visionSummary) {
  userQuestion = `${userQuestion}\n\n[附圖分析]\n${visionSummary}`
}

// 新增: 加入檔案摘要
if (fileAnalysisSummaries.length > 0) {
  userQuestion = `${userQuestion}\n\n[附件分析]\n${fileAnalysisSummaries.join('\n\n')}`
}
```

### 步驟 6: 新增獨立的檔案 API 端點 (可選,提升體驗)

在 `index.ts` 任意位置新增這些端點:

```typescript
// 檔案列表
app.get('/api/files', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : undefined
    const fileType = typeof req.query.type === 'string' ? req.query.type : undefined
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50

    let files = fileHandler.getUserFiles(req.authUser.username, limit * 2)

    // 篩選
    if (catId) {
      files = files.filter(f => f.catId === catId)
    }
    if (fileType) {
      files = files.filter(f => f.fileType === fileType)
    }

    res.json({
      success: true,
      files: files.slice(0, limit)
    })
  } catch (error) {
    console.error('[files] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list files' })
  }
})

// 刪除檔案
app.delete('/api/files/:id', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const fileId = req.params.id
    const metadata = fileHandler.getFileMetadata(fileId)

    if (!metadata) {
      return res.status(404).json({ success: false, error: 'File not found' })
    }

    // 驗證擁有權
    if (metadata.userId !== req.authUser.username && req.authUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Permission denied' })
    }

    await fileHandler.deleteFile(fileId)

    res.json({ success: true })
  } catch (error) {
    console.error('[files] Delete error:', error)
    res.status(500).json({ success: false, error: 'Failed to delete file' })
  }
})

// 儲存統計
app.get('/api/files/stats', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const stats = fileHandler.getStorageStats()
    res.json({ success: true, stats })
  } catch (error) {
    console.error('[files] Stats error:', error)
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})
```

---

## 🎨 前端整合步驟

### 步驟 1: 更新 backendClient.ts

在 `smart-cat-home/src/utils/backendClient.ts` 新增:

```typescript
// 檔案相關 API
export interface FileUploadRequest {
  files: Array<{
    data: string      // Base64
    mimeType: string
    filename: string
    description?: string
  }>
  catId?: string
}

export interface FileUploadResponse {
  success: boolean
  files?: Array<{
    id: string
    filename: string
    analysis?: any
  }>
  error?: string
}

export async function uploadFiles(request: FileUploadRequest): Promise<FileUploadResponse> {
  const response = await fetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(request)
  })

  return response.json()
}

export async function listFiles(options?: {
  catId?: string
  type?: string
  limit?: number
}): Promise<any> {
  const params = new URLSearchParams()
  if (options?.catId) params.append('catId', options.catId)
  if (options?.type) params.append('type', options.type)
  if (options?.limit) params.append('limit', options.limit.toString())

  const response = await fetch(`${BASE_URL}/api/files?${params}`, {
    headers: getAuthHeaders()
  })

  return response.json()
}

export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  })

  return response.json()
}

// 修改現有的 fetchChatSuggestions
export async function fetchChatSuggestions(
  message: string,
  options?: {
    // ... 現有選項
    fileAttachments?: Array<{
      data: string
      mimeType: string
      filename: string
      description?: string
    }>
  }
): Promise<ChatSuggestionResponse> {
  // 在 body 中新增 fileAttachments
  const body = {
    message,
    // ... 現有欄位
    fileAttachments: options?.fileAttachments
  }

  // ... 其餘程式碼不變
}
```

### 步驟 2: 實作 useFileUpload Hook

建立 `smart-cat-home/src/hooks/useFileUpload.ts`:

```typescript
import { useState } from 'react'
import type { FileAttachment, FileUploadStatus } from '../types/files'
import { validateFile, fileToBase64, compressImage, detectFileType } from '../types/files'

export function useFileUpload() {
  const [files, setFiles] = useState<FileAttachment[]>([])

  const addFiles = async (fileList: FileList) => {
    const newFiles: FileAttachment[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]

      // 驗證
      const validation = validateFile(file)
      if (!validation.valid) {
        alert(`檔案 ${file.name} 無效: ${validation.error}`)
        continue
      }

      const fileType = detectFileType(file)
      const id = `file_${Date.now()}_${i}`

      newFiles.push({
        id,
        file,
        type: fileType,
        status: 'pending',
        progress: 0,
        uploadedAt: new Date()
      })
    }

    setFiles(prev => [...prev, ...newFiles])

    // 生成預覽
    for (const fileAttachment of newFiles) {
      if (fileAttachment.type === 'image') {
        try {
          let preview: string

          // 壓縮圖片
          if (fileAttachment.file.size > 1024 * 1024) { // > 1MB
            const compressed = await compressImage(fileAttachment.file, 0.8, 800, 800)
            preview = await fileToBase64(new File([compressed], fileAttachment.file.name))
          } else {
            preview = await fileToBase64(fileAttachment.file)
          }

          updateFile(fileAttachment.id, { preview, status: 'ready' })
        } catch (error) {
          updateFile(fileAttachment.id, {
            status: 'error',
            error: '無法生成預覽'
          })
        }
      } else {
        updateFile(fileAttachment.id, { status: 'ready' })
      }
    }
  }

  const updateFile = (id: string, updates: Partial<FileAttachment>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearFiles = () => {
    setFiles([])
  }

  return {
    files,
    addFiles,
    updateFile,
    removeFile,
    clearFiles
  }
}
```

### 步驟 3: 修改 AiChatPanel.tsx

在 `AiChatPanel` 元件中:

```typescript
import { useFileUpload } from '../hooks/useFileUpload'

// 在元件內
const { files, addFiles, removeFile, clearFiles } = useFileUpload()

// 修改發送訊息的函數
const handleSendMessage = async () => {
  // ... 現有的圖片處理

  // 處理其他檔案
  const fileAttachments = await Promise.all(
    files.map(async (f) => ({
      data: f.preview || await fileToBase64(f.file),
      mimeType: f.file.type,
      filename: f.file.name,
      description: f.description
    }))
  )

  // 發送
  const response = await fetchChatSuggestions(message, {
    // ... 現有選項
    fileAttachments
  })

  // 清空檔案列表
  clearFiles()
}

// 在 JSX 中新增檔案上傳區域
<div className="file-upload-area">
  <input
    type="file"
    multiple
    accept="image/*,.pdf,audio/*,video/*"
    onChange={(e) => {
      if (e.target.files) {
        addFiles(e.target.files)
      }
    }}
  />

  {/* 顯示已選檔案 */}
  {files.length > 0 && (
    <div className="file-preview-list">
      {files.map(file => (
        <div key={file.id} className="file-preview-card">
          <span>{getFileTypeIcon(file.type)} {file.file.name}</span>
          <button onClick={() => removeFile(file.id)}>✕</button>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## 📊 測試流程

### 1. 啟動後端
```bash
cd smart-cat-backend
npm run build
npm start
```

檢查日誌是否出現:
```
[server] Upload directories initialized
[database] Migration 013_file_uploads applied
```

### 2. 測試檔案上傳 API (使用 Postman 或 curl)

```bash
# 準備測試檔案 (PDF)
base64_content=$(base64 -i test.pdf)

# 發送請求
curl -X POST http://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "{
    \"message\": \"請幫我分析這份醫療報告\",
    \"fileAttachments\": [{
      \"data\": \"data:application/pdf;base64,$base64_content\",
      \"mimeType\": \"application/pdf\",
      \"filename\": \"test.pdf\",
      \"description\": \"我的貓咪的健康檢查報告\"
    }]
  }"
```

### 3. 檢查檔案是否儲存

```bash
ls -lh smart-cat-backend/uploads/pdfs/
sqlite3 smart-cat-backend/smart-cat-home.db "SELECT id, filename, file_type, uploaded_at FROM file_uploads;"
```

### 4. 前端測試

啟動前端:
```bash
cd smart-cat-home
npm run dev
```

操作步驟:
1. 登入
2. 打開 AI 聊天面板
3. 點擊檔案上傳按鈕
4. 選擇測試檔案 (圖片、PDF、音訊或影片)
5. 輸入描述(可選)
6. 發送訊息
7. 檢查 AI 回覆是否包含檔案分析結果

---

## 🐛 常見問題排解

### 問題 1: Migration 沒有執行
**症狀**: 啟動時沒看到 "Migration 013_file_uploads applied"

**解決**:
```bash
# 檢查已應用的 migrations
sqlite3 smart-cat-home.db "SELECT * FROM schema_migrations;"

# 如果沒有 013,手動執行
sqlite3 smart-cat-home.db < path/to/migration_013.sql
```

### 問題 2: 檔案上傳後找不到
**症狀**: 404 錯誤或檔案路徑不存在

**檢查**:
```bash
# 確認目錄存在
ls smart-cat-backend/uploads/

# 確認檔案權限
chmod 755 smart-cat-backend/uploads/
```

### 問題 3: PDF 解析失敗
**症狀**: "Failed to extract text from PDF"

**原因**: 可能是圖片型 PDF 或加密 PDF

**解決**: 在錯誤訊息中提示使用者描述內容

### 問題 4: Base64 解碼錯誤
**症狀**: "Invalid base64 format"

**檢查**:
- 前端是否正確編碼 (包含 `data:mime/type;base64,` 前綴)
- 檔案是否過大導致截斷

---

## 🚀 後續優化建議

1. **進度反饋**: 在前端顯示檔案分析進度 (使用 WebSocket 或輪詢)
2. **批次處理**: 同時上傳多個檔案時並行分析
3. **快取機制**: 相同檔案不重複分析
4. **縮略圖生成**: 為影片生成預覽縮略圖
5. **OCR 支援**: 為圖片型 PDF 加入 OCR
6. **語音轉文字**: 整合 Whisper 模型進行音訊轉錄

---

## ✅ 整合檢查清單

- [ ] 後端導入所有新模組
- [ ] 確保 `ensureUploadDir()` 在啟動時執行
- [ ] 修改 `/api/chat/suggestions` 支援 `fileAttachments`
- [ ] 新增檔案相關 API 端點 (列表、刪除、統計)
- [ ] 前端更新 `backendClient.ts`
- [ ] 實作 `useFileUpload` hook
- [ ] 修改 `AiChatPanel` 整合檔案上傳 UI
- [ ] 測試所有檔案類型 (圖片、PDF、音訊、影片)
- [ ] 檢查錯誤處理和使用者提示
- [ ] 確認檔案自動清理功能運作

---

完成以上步驟後,您的 Smart Cat Home 將具備完整的多檔案上傳和 AI 分析能力! 🎉
