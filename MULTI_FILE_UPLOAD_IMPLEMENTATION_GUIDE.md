# 📁 多檔案上傳系統完整實作指南

## 📋 實作狀況總覽

根據你的文件 `AI_FILE_UPLOAD_IMPLEMENTATION.md` 和 `AI_功能增強總結_ZH.md`,專案已完成以下核心模組:

### ✅ 已完成 (40% 進度)

1. ✅ **檔案類型系統** (`smart-cat-home/src/types/files.ts`) - 型別定義
2. ✅ **後端檔案處理器** (`smart-cat-backend/src/fileHandler.ts`) - Base64 解析、儲存
3. ✅ **PDF 解析器** (`smart-cat-backend/src/pdfParser.ts`) - 文字提取、AI 分析
4. ✅ **音訊分析器** (`smart-cat-backend/src/audioAnalyzer.ts`) - 情緒識別
5. ✅ **影片處理器** (`smart-cat-backend/src/videoProcessor.ts`) - 行為分析
6. ✅ **資料庫遷移** (`smart-cat-backend/src/db.ts`) - Migration 013

### 🔨 待完成 (60% 工作)

1. 🔨 **後端 API 端點** - REST API for CRUD
2. 🔨 **前端組件** - FileUploadZone, FilePreviewCard
3. 🔨 **聊天 API 整合** - 支援 `fileAttachments` 參數
4. 🔨 **前端 Hook** - useFileUpload
5. 🔨 **測試** - 端到端測試

---

## 🎯 實作計劃

### 階段 1: 後端 API 端點 (1-2 小時)

#### 檔案: `smart-cat-backend/src/index.ts`

需要新增 4 個 API 端點:

```typescript
// 1. 檔案上傳
POST /api/files/upload
Body: {
  files: Array<{ dataUrl: string, filename: string, mimeType: string }>,
  catId?: string,
  descriptions?: string[]
}
Response: {
  success: boolean,
  files: Array<{ id: string, filename: string, fileType: string, analysis?: any }>
}

// 2. 檔案分析
POST /api/files/:id/analyze
Body: { description?: string }
Response: { success: boolean, analysis: FileAnalysisResult }

// 3. 檔案列表
GET /api/files?catId=xxx&type=image&limit=50
Response: { files: Array<FileMetadata> }

// 4. 檔案刪除
DELETE /api/files/:id
Response: { success: boolean }
```

#### 實作步驟:

1. **Import 核心模組**:
```typescript
import {
  parseBase64File,
  saveFile,
  readFile,
  updateAnalysisResult,
  cleanupOldFiles,
} from './fileHandler'
import { analyzePDFWithAI, extractTextFromPDF } from './pdfParser'
import { analyzeAudioWithAI } from './audioAnalyzer'
import { analyzeVideoWithAI } from './videoProcessor'
```

2. **新增 POST /api/files/upload 端點**
3. **新增 POST /api/files/:id/analyze 端點**
4. **新增 GET /api/files 端點**
5. **新增 DELETE /api/files/:id 端點**

---

### 階段 2: 修改聊天 API (30 分鐘)

#### 檔案: `smart-cat-backend/src/index.ts`

修改 `POST /api/chat/suggestions` 端點以支援 `fileAttachments`:

```typescript
// 當前程式碼 (第 2384-2392 行) 只支援 imageBase64
const imageBase64 = typeof message.imageBase64 === 'string' ? message.imageBase64 : ''

// 新增支援 fileAttachments
const fileAttachments = Array.isArray(message.fileAttachments) ? message.fileAttachments : []

// 批量分析檔案
for (const fileId of fileAttachments) {
  const fileData = await readFile(fileId)
  if (fileData.fileType === 'pdf') {
    const pdfAnalysis = await analyzePDFWithAI(fileId, generateChatContent)
    // 將分析結果嵌入對話上下文
  } else if (fileData.fileType === 'audio') {
    const audioAnalysis = await analyzeAudioWithAI(fileId, question, generateChatContent)
  } else if (fileData.fileType === 'video') {
    const videoAnalysis = await analyzeVideoWithAI(fileId, question, generateChatContent)
  }
}
```

---

### 階段 3: 前端組件實作 (2-3 小時)

#### 3.1 FileUploadZone 組件

**檔案**: `smart-cat-home/src/components/FileUploadZone.tsx`

```typescript
import { useCallback, useState } from 'react'
import { useLanguage } from '../i18n/useLanguage'
import './FileUploadZone.css'

interface FileUploadZoneProps {
  onFilesSelect: (files: File[]) => void
  accept?: string
  maxFiles?: number
  maxSizeMB?: number
}

export function FileUploadZone({
  onFilesSelect,
  accept = 'image/*,application/pdf,audio/*,video/*',
  maxFiles = 5,
  maxSizeMB = 50,
}: FileUploadZoneProps) {
  const { t } = useLanguage()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFiles = (files: File[]): File[] => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    const valid = files.filter(file => {
      if (file.size > maxSizeBytes) {
        setError(`${file.name} 超過 ${maxSizeMB}MB 限制`)
        return false
      }
      return true
    })
    if (valid.length > maxFiles) {
      setError(`最多只能上傳 ${maxFiles} 個檔案`)
      return valid.slice(0, maxFiles)
    }
    return valid
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setError(null)

    const files = Array.from(e.dataTransfer.files)
    const validated = validateFiles(files)
    if (validated.length > 0) {
      onFilesSelect(validated)
    }
  }, [onFilesSelect, maxFiles, maxSizeMB])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const files = e.target.files ? Array.from(e.target.files) : []
    const validated = validateFiles(files)
    if (validated.length > 0) {
      onFilesSelect(validated)
    }
  }

  return (
    <div
      className={`file-upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="file-upload-input"
        multiple
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <label htmlFor="file-upload-input" className="upload-zone__label">
        <span className="upload-zone__icon">📁</span>
        <span className="upload-zone__text">
          {t('fileUpload.dragOrClick')}
        </span>
        <span className="upload-zone__hint">
          {t('fileUpload.acceptedTypes')}
        </span>
      </label>
      {error && (
        <div className="upload-zone__error">{error}</div>
      )}
    </div>
  )
}
```

**CSS**: `smart-cat-home/src/components/FileUploadZone.css`

```css
.file-upload-zone {
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  transition: all 0.3s ease;
  cursor: pointer;
  background: #f7fafc;
}

.file-upload-zone.dragging {
  border-color: #4299e1;
  background: #ebf8ff;
}

.file-upload-zone:hover {
  border-color: #4299e1;
}

.upload-zone__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.upload-zone__icon {
  font-size: 48px;
}

.upload-zone__text {
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
}

.upload-zone__hint {
  font-size: 14px;
  color: #718096;
}

.upload-zone__error {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fed7d7;
  color: #c53030;
  border-radius: 4px;
  font-size: 14px;
}
```

#### 3.2 FilePreviewCard 組件

**檔案**: `smart-cat-home/src/components/FilePreviewCard.tsx`

```typescript
import { useLanguage } from '../i18n/useLanguage'
import { Loader } from './Loader'
import './FilePreviewCard.css'

interface FilePreviewCardProps {
  id?: string
  filename: string
  fileType: 'image' | 'pdf' | 'audio' | 'video' | 'unknown'
  fileSize?: number
  dataUrl?: string
  status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error'
  progress?: number
  analysis?: {
    summary?: string
    confidence?: number
  }
  onRemove: () => void
}

export function FilePreviewCard({
  filename,
  fileType,
  fileSize,
  dataUrl,
  status,
  progress,
  analysis,
  onRemove,
}: FilePreviewCardProps) {
  const { t } = useLanguage()

  const typeIcons = {
    image: '🖼️',
    pdf: '📄',
    audio: '🎤',
    video: '🎥',
    unknown: '📎',
  }

  const statusLabels = {
    pending: t('fileUpload.status.pending'),
    uploading: t('fileUpload.status.uploading'),
    analyzing: t('fileUpload.status.analyzing'),
    complete: t('fileUpload.status.complete'),
    error: t('fileUpload.status.error'),
  }

  return (
    <div className={`file-preview-card file-preview-card--${status}`}>
      <div className="file-preview__thumbnail">
        {fileType === 'image' && dataUrl ? (
          <img src={dataUrl} alt={filename} />
        ) : (
          <span className="file-preview__icon">{typeIcons[fileType]}</span>
        )}
      </div>

      <div className="file-preview__info">
        <div className="file-preview__header">
          <span className="file-preview__filename">{filename}</span>
          <button
            type="button"
            className="file-preview__remove"
            onClick={onRemove}
            aria-label={t('fileUpload.remove')}
          >
            ✕
          </button>
        </div>

        {fileSize && (
          <span className="file-preview__size">
            {(fileSize / 1024 / 1024).toFixed(2)} MB
          </span>
        )}

        <div className="file-preview__status">
          <span className="status-label">{statusLabels[status]}</span>
          {(status === 'uploading' || status === 'analyzing') && (
            <Loader size="small" />
          )}
        </div>

        {progress !== undefined && progress < 100 && (
          <div className="file-preview__progress">
            <div
              className="progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {analysis && analysis.summary && (
          <div className="file-preview__analysis">
            <span className="analysis__summary">{analysis.summary}</span>
            {analysis.confidence && (
              <span className="analysis__confidence">
                {t('fileUpload.confidence')}: {(analysis.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

**CSS**: `smart-cat-home/src/components/FilePreviewCard.css`

```css
.file-preview-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  transition: all 0.3s ease;
}

.file-preview-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.file-preview-card--complete {
  border-color: #48bb78;
}

.file-preview-card--error {
  border-color: #f56565;
  background: #fff5f5;
}

.file-preview__thumbnail {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  overflow: hidden;
  background: #f7fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-preview__thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-preview__icon {
  font-size: 32px;
}

.file-preview__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-preview__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.file-preview__filename {
  font-size: 14px;
  font-weight: 600;
  color: #2d3748;
  word-break: break-word;
}

.file-preview__remove {
  padding: 4px;
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.file-preview__remove:hover {
  color: #718096;
}

.file-preview__size {
  font-size: 12px;
  color: #718096;
}

.file-preview__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #4a5568;
}

.file-preview__progress {
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4299e1, #667eea);
  transition: width 0.3s ease;
}

.file-preview__analysis {
  margin-top: 8px;
  padding: 8px;
  background: #ebf8ff;
  border-radius: 4px;
  font-size: 12px;
}

.analysis__summary {
  display: block;
  color: #2c5282;
  margin-bottom: 4px;
}

.analysis__confidence {
  color: #4299e1;
  font-weight: 600;
}
```

#### 3.3 useFileUpload Hook

**檔案**: `smart-cat-home/src/hooks/useFileUpload.ts`

```typescript
import { useState, useCallback } from 'react'
import { uploadFiles, analyzeFile, deleteFile } from '../utils/backendClient'

export interface FileUploadItem {
  id: string
  file: File
  filename: string
  fileType: 'image' | 'pdf' | 'audio' | 'video' | 'unknown'
  fileSize: number
  dataUrl?: string
  status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error'
  progress: number
  serverId?: string
  analysis?: {
    summary?: string
    confidence?: number
    recommendations?: string[]
  }
  error?: string
}

export function useFileUpload(catId?: string | null) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback(async (newFiles: File[]) => {
    const items: FileUploadItem[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      filename: file.name,
      fileType: detectFileType(file),
      fileSize: file.size,
      status: 'pending' as const,
      progress: 0,
    }))

    // Add preview for images
    for (const item of items) {
      if (item.fileType === 'image') {
        item.dataUrl = await readFileAsDataURL(item.file)
      }
    }

    setFiles(prev => [...prev, ...items])
    return items
  }, [])

  const uploadAndAnalyze = useCallback(async (items: FileUploadItem[]) => {
    setUploading(true)

    for (const item of items) {
      try {
        // Update status: uploading
        setFiles(prev =>
          prev.map(f =>
            f.id === item.id ? { ...f, status: 'uploading' as const, progress: 30 } : f
          )
        )

        // Read file as Base64
        const dataUrl = await readFileAsDataURL(item.file)

        // Upload to server
        const uploadResult = await uploadFiles([{
          dataUrl,
          filename: item.filename,
          mimeType: item.file.type,
        }], catId ?? undefined)

        if (!uploadResult.success || !uploadResult.files[0]) {
          throw new Error('Upload failed')
        }

        const serverId = uploadResult.files[0].id

        // Update status: analyzing
        setFiles(prev =>
          prev.map(f =>
            f.id === item.id
              ? { ...f, serverId, status: 'analyzing' as const, progress: 60 }
              : f
          )
        )

        // Analyze file
        const analysisResult = await analyzeFile(serverId)

        // Update status: complete
        setFiles(prev =>
          prev.map(f =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'complete' as const,
                  progress: 100,
                  analysis: analysisResult.analysis,
                }
              : f
          )
        )
      } catch (error) {
        console.error('[useFileUpload] Error:', error)
        setFiles(prev =>
          prev.map(f =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : 'Unknown error',
                }
              : f
          )
        )
      }
    }

    setUploading(false)
  }, [catId])

  const removeFile = useCallback(async (id: string) => {
    const item = files.find(f => f.id === id)
    if (item?.serverId) {
      try {
        await deleteFile(item.serverId)
      } catch (error) {
        console.error('[useFileUpload] Delete error:', error)
      }
    }
    setFiles(prev => prev.filter(f => f.id !== id))
  }, [files])

  const clearAll = useCallback(() => {
    setFiles([])
  }, [])

  return {
    files,
    uploading,
    addFiles,
    uploadAndAnalyze,
    removeFile,
    clearAll,
  }
}

function detectFileType(file: File): FileUploadItem['fileType'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return 'unknown'
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
```

---

### 階段 4: 整合到 AiChatPanel (1 小時)

修改 `smart-cat-home/src/components/AiChatPanel.tsx`:

```typescript
import { FileUploadZone } from './FileUploadZone'
import { FilePreviewCard } from './FilePreviewCard'
import { useFileUpload } from '../hooks/useFileUpload'

// ... 在 AiChatPanelComponent 內部

const { files, uploading, addFiles, uploadAndAnalyze, removeFile, clearAll } = useFileUpload(catId)

const handleFilesSelect = async (newFiles: File[]) => {
  const items = await addFiles(newFiles)
  await uploadAndAnalyze(items)
}

// ... 在 return 的 JSX 中

<div className="ai-chat__file-upload-section">
  <FileUploadZone
    onFilesSelect={handleFilesSelect}
    maxFiles={5}
    maxSizeMB={50}
  />

  {files.length > 0 && (
    <div className="ai-chat__file-list">
      {files.map(file => (
        <FilePreviewCard
          key={file.id}
          {...file}
          onRemove={() => removeFile(file.id)}
        />
      ))}
    </div>
  )}
</div>

// 在發送訊息時包含檔案 ID
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  const completeFiles = files.filter(f => f.status === 'complete' && f.serverId)
  const fileAttachments = completeFiles.map(f => f.serverId!)

  await sendMessage(input, undefined, {
    modelPreference,
    reasoningEffort,
    enableSearch: searchModeEnabled,
    fileAttachments,  // ← 新增
  })

  clearAll()
  setInput('')
}
```

---

### 階段 5: 更新 backendClient (30 分鐘)

在 `smart-cat-home/src/utils/backendClient.ts` 新增:

```typescript
export async function uploadFiles(
  files: Array<{ dataUrl: string; filename: string; mimeType: string }>,
  catId?: string
): Promise<{ success: boolean; files: Array<{ id: string; filename: string; fileType: string }> }> {
  const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, catId }),
  })
  return response.json()
}

export async function analyzeFile(
  fileId: string,
  description?: string
): Promise<{ success: boolean; analysis: any }> {
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  return response.json()
}

export async function fetchFiles(params?: {
  catId?: string
  type?: string
  limit?: number
}): Promise<{ files: Array<any> }> {
  const query = new URLSearchParams(params as any).toString()
  const response = await fetch(`${API_BASE_URL}/api/files?${query}`)
  return response.json()
}

export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
    method: 'DELETE',
  })
  return response.json()
}
```

---

### 階段 6: 翻譯 (15 分鐘)

在 `smart-cat-home/src/i18n/translations.ts` 新增:

```typescript
// 繁體中文
'fileUpload.dragOrClick': '拖曳檔案到此處或點擊選擇',
'fileUpload.acceptedTypes': '支援圖片、PDF、音訊、影片檔案',
'fileUpload.remove': '移除',
'fileUpload.confidence': '信心度',
'fileUpload.status.pending': '待上傳',
'fileUpload.status.uploading': '上傳中',
'fileUpload.status.analyzing': '分析中',
'fileUpload.status.complete': '完成',
'fileUpload.status.error': '錯誤',

// English
'fileUpload.dragOrClick': 'Drag files here or click to select',
'fileUpload.acceptedTypes': 'Supports images, PDF, audio, video files',
'fileUpload.remove': 'Remove',
'fileUpload.confidence': 'Confidence',
'fileUpload.status.pending': 'Pending',
'fileUpload.status.uploading': 'Uploading',
'fileUpload.status.analyzing': 'Analyzing',
'fileUpload.status.complete': 'Complete',
'fileUpload.status.error': 'Error',
```

---

## 🧪 測試計劃

### 單元測試

1. **FileUploadZone 組件**:
   - 拖放功能
   - 檔案驗證 (大小、數量)
   - 錯誤處理

2. **useFileUpload Hook**:
   - 檔案新增
   - 上傳流程
   - 錯誤處理

### 整合測試

1. **完整上傳流程**:
   - 選擇檔案 → 上傳 → 分析 → 顯示結果
   - 多檔案同時上傳
   - 圖片、PDF、音訊、影片各一個

2. **聊天整合**:
   - 上傳檔案後發送訊息
   - AI 回應包含檔案分析內容

3. **錯誤處理**:
   - 檔案過大
   - 不支援的格式
   - 網路錯誤

---

## 📊 預估時間

| 階段 | 預估時間 | 實際時間 |
|------|---------|---------|
| 後端 API 端點 | 1-2 小時 | |
| 聊天 API 修改 | 30 分鐘 | |
| 前端組件 | 2-3 小時 | |
| 聊天整合 | 1 小時 | |
| backendClient | 30 分鐘 | |
| 翻譯 | 15 分鐘 | |
| **總計** | **5-7 小時** | |

---

## ✅ 檢查清單

### 後端
- [ ] 新增 4 個 API 端點
- [ ] 修改聊天 API 支援 fileAttachments
- [ ] 測試所有端點

### 前端
- [ ] 實作 FileUploadZone 組件
- [ ] 實作 FilePreviewCard 組件
- [ ] 實作 useFileUpload hook
- [ ] 整合到 AiChatPanel
- [ ] 更新 backendClient
- [ ] 新增翻譯

### 測試
- [ ] 圖片上傳和顯示
- [ ] PDF 分析
- [ ] 音訊情緒分析
- [ ] 影片行為分析
- [ ] 多檔案上傳
- [ ] 錯誤處理

---

## 🚀 快速啟動指令

```bash
# 後端
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
npm run build
npm start

# 前端
cd /Users/meaqua/Desktop/EE3070/smart-cat-home
npm run dev
```

---

## 📚 參考文件

- [AI_FILE_UPLOAD_IMPLEMENTATION.md](./AI_FILE_UPLOAD_IMPLEMENTATION.md)
- [AI_功能增強總結_ZH.md](./AI_功能增強總結_ZH.md)
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
