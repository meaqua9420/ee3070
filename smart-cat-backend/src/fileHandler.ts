// 文件處理核心模組
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { getDb } from './db.js'

export type SupportedFileType = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'unknown'

export interface ParsedFile {
  id: string
  filename: string
  mimeType: string
  fileType: SupportedFileType
  size: number
  data: Buffer | string  // Buffer for binary, string for base64
  storagePath?: string
  uploadedAt: Date
}

export interface FileMetadata {
  id: string
  userId?: string
  catId?: string
  filename: string
  mimeType: string
  fileType: SupportedFileType
  fileSize: number
  storagePath: string
  analysisResult?: any
  uploadedAt: Date
}

// 設定
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

const DEFAULT_MAX_FILE_SIZE = 32 * 1024 * 1024 // 32MB 上傳上限（可用環境變數覆寫）
const CONFIGURED_MAX_FILE_SIZE = Number.parseInt(process.env.FILE_UPLOAD_MAX_BYTES ?? '', 10)
const MAX_FILE_SIZE =
  Number.isFinite(CONFIGURED_MAX_FILE_SIZE) && CONFIGURED_MAX_FILE_SIZE > 0
    ? Math.min(CONFIGURED_MAX_FILE_SIZE, 100 * 1024 * 1024) // 絕對上限 100MB，防止誤設過大
    : DEFAULT_MAX_FILE_SIZE

const MAX_IN_MEMORY_SIZE = 10 * 1024 * 1024  // 10MB - 小於此大小的檔案直接存記憶體

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'text/plain',
  'text/markdown',
])

// 確保上傳目錄存在
export async function ensureUploadDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_DIR)
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  }

  // 建立子目錄
  const subdirs = ['images', 'pdfs', 'audio', 'video', 'temp']
  for (const subdir of subdirs) {
    const dirPath = path.join(UPLOAD_DIR, subdir)
    try {
      await fs.access(dirPath)
    } catch {
      await fs.mkdir(dirPath, { recursive: true })
    }
  }
}

// 檢測檔案類型
export function detectFileType(mimeType: string, filename: string): SupportedFileType {
  const mime = mimeType.toLowerCase()
  const name = filename.toLowerCase()

  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/') || name.match(/\.(txt|md|log)$/)) return 'text'

  return 'unknown'
}

// 估算 Base64 內容的實際位元組數，避免在解碼前就耗盡記憶體
function estimateBase64Size(base64Content: string): number {
  const normalized = base64Content.replace(/=+$/, '')
  return Math.floor(normalized.length * 3 / 4)
}

// 解析 Base64 檔案
export function parseBase64File(base64Data: string, filename: string): ParsedFile {
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/)

  if (!match || !match[1] || !match[2]) {
    throw new Error('Invalid base64 format')
  }

  const mimeType = match[1].trim()
  const base64Content = match[2].trim()

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`)
  }

  const estimatedSize = estimateBase64Size(base64Content)
  if (!Number.isFinite(estimatedSize) || estimatedSize <= 0) {
    throw new Error('Invalid base64 payload')
  }
  if (estimatedSize > MAX_FILE_SIZE) {
    throw new Error(`File too large: ~${estimatedSize} bytes exceeds limit ${MAX_FILE_SIZE}`)
  }

  const buffer = Buffer.from(base64Content, 'base64')
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large after decoding: ${buffer.length} bytes exceeds limit ${MAX_FILE_SIZE}`)
  }

  const fileType = detectFileType(mimeType, filename)
  if (fileType === 'unknown') {
    throw new Error(`Unsupported file type for ${filename}`)
  }

  const id = generateFileId()

  return {
    id,
    filename,
    mimeType,
    fileType,
    size: buffer.length,
    data: buffer,
    uploadedAt: new Date()
  }
}

// 生成唯一檔案 ID
export function generateFileId(): string {
  return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
}

// 儲存檔案
export async function saveFile(
  parsedFile: ParsedFile,
  userId?: string,
  catId?: string
): Promise<FileMetadata> {
  await ensureUploadDir()

  const { id, filename, mimeType, fileType, size, data } = parsedFile

  // 驗證檔案大小
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${size} bytes (max: ${MAX_FILE_SIZE})`)
  }

  // 決定儲存路徑
  const subdir = fileType === 'unknown' ? 'temp' : `${fileType}s`
  const ext = path.extname(filename) || getExtensionFromMime(mimeType) || ''
  const safeFilename = `${id}${ext}`
  const storagePath = path.join(UPLOAD_DIR, subdir, safeFilename)

  // 寫入檔案
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'base64')
  await fs.writeFile(storagePath, buffer)

  // 儲存元資料到資料庫
  const db = getDb()
  const metadata: FileMetadata = {
    id,
    ...(userId ? { userId } : {}),
    ...(catId ? { catId } : {}),
    filename,
    mimeType,
    fileType,
    fileSize: size,
    storagePath,
    uploadedAt: new Date()
  }

  db.prepare(`
    INSERT INTO file_uploads (
      id, user_id, cat_id, filename, mime_type, file_type,
      file_size, storage_path, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId || null,
    catId || null,
    filename,
    mimeType,
    fileType,
    size,
    storagePath,
    new Date().toISOString()
  )

  return metadata
}

// 讀取檔案
export async function readFile(fileId: string): Promise<Buffer> {
  const db = getDb()
  const row = db.prepare('SELECT storage_path FROM file_uploads WHERE id = ?').get(fileId) as { storage_path: string } | undefined

  if (!row) {
    throw new Error(`File not found: ${fileId}`)
  }

  return await fs.readFile(row.storage_path)
}

// 刪除檔案
export async function deleteFile(fileId: string): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT storage_path FROM file_uploads WHERE id = ?').get(fileId) as { storage_path: string } | undefined

  if (!row) {
    throw new Error(`File not found: ${fileId}`)
  }

  // 刪除實體檔案
  try {
    await fs.unlink(row.storage_path)
  } catch (error) {
    console.error(`Failed to delete file ${row.storage_path}:`, error)
  }

  // 刪除資料庫記錄
  db.prepare('DELETE FROM file_uploads WHERE id = ?').run(fileId)
}

// 更新分析結果
export function updateAnalysisResult(fileId: string, analysisResult: any): void {
  const db = getDb()
  db.prepare('UPDATE file_uploads SET analysis_result = ? WHERE id = ?').run(
    JSON.stringify(analysisResult),
    fileId
  )
}

// 取得檔案元資料
export function getFileMetadata(fileId: string): FileMetadata | undefined {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      id, user_id, cat_id, filename, mime_type, file_type,
      file_size, storage_path, analysis_result, uploaded_at
    FROM file_uploads
    WHERE id = ?
  `).get(fileId) as any

  if (!row) return undefined

  return {
    id: row.id,
    userId: row.user_id,
    catId: row.cat_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    analysisResult: row.analysis_result ? JSON.parse(row.analysis_result) : undefined,
    uploadedAt: new Date(row.uploaded_at)
  }
}

// 清理過期檔案
export async function cleanupOldFiles(daysOld: number = 30): Promise<number> {
  const db = getDb()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const oldFiles = db.prepare(`
    SELECT id, storage_path
    FROM file_uploads
    WHERE uploaded_at < ?
  `).all(cutoffDate.toISOString()) as Array<{ id: string; storage_path: string }>

  let deletedCount = 0

  for (const file of oldFiles) {
    try {
      await fs.unlink(file.storage_path)
      db.prepare('DELETE FROM file_uploads WHERE id = ?').run(file.id)
      deletedCount++
    } catch (error) {
      console.error(`Failed to delete old file ${file.id}:`, error)
    }
  }

  return deletedCount
}

// 取得使用者的檔案列表
export function getUserFiles(userId: string, limit: number = 50): FileMetadata[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      id, user_id, cat_id, filename, mime_type, file_type,
      file_size, storage_path, analysis_result, uploaded_at
    FROM file_uploads
    WHERE user_id = ?
    ORDER BY uploaded_at DESC
    LIMIT ?
  `).all(userId, limit) as any[]

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    catId: row.cat_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    analysisResult: row.analysis_result ? JSON.parse(row.analysis_result) : undefined,
    uploadedAt: new Date(row.uploaded_at)
  }))
}

// 根據 MIME 類型取得副檔名
function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/webm': '.weba',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'text/plain': '.txt',
    'text/markdown': '.md'
  }

  return mimeMap[mimeType] || ''
}

// 取得儲存統計
export function getStorageStats(): {
  totalFiles: number
  totalSize: number
  byType: Record<SupportedFileType, { count: number; size: number }>
} {
  const db = getDb()

  const total = db.prepare(`
    SELECT COUNT(*) as count, SUM(file_size) as size
    FROM file_uploads
  `).get() as { count: number; size: number }

  const byType = db.prepare(`
    SELECT file_type, COUNT(*) as count, SUM(file_size) as size
    FROM file_uploads
    GROUP BY file_type
  `).all() as Array<{ file_type: SupportedFileType; count: number; size: number }>

  const byTypeMap: Record<SupportedFileType, { count: number; size: number }> = {
    image: { count: 0, size: 0 },
    pdf: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    text: { count: 0, size: 0 },
    unknown: { count: 0, size: 0 }
  }

  byType.forEach(item => {
    byTypeMap[item.file_type] = { count: item.count, size: item.size || 0 }
  })

  return {
    totalFiles: total.count || 0,
    totalSize: total.size || 0,
    byType: byTypeMap
  }
}
