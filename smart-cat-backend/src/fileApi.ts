/**
 * 檔案上傳 API 端點
 * File Upload API Endpoints
 */
import type { Request, Response, NextFunction } from 'express'
import {
  parseBase64File,
  saveFile,
  readFile as readFileBuffer,
  deleteFile as deleteFileFromStorage,
  updateAnalysisResult,
  getFileMetadata,
  type FileMetadata,
  type ParsedFile,
} from './fileHandler.js'
import {
  extractTextFromPDF,
  analyzePDFWithAI,
  detectPetRelated,
  type PDFAnalysisResult,
} from './pdfParser.js'
import { extractImagesFromPDF, imageToBase64, type ExtractedImage } from './pdfImageExtractor.js'
import { analyzePDFWithUltraMode, type UltraPDFAnalysisResult } from './pdfUltraAnalyzer.js'
import { analyzeAudioWithAI, type AudioAnalysisResult } from './audioAnalyzer.js'
import { analyzeVideoWithAI, type VideoAnalysisResult } from './videoProcessor.js'
import { generateChatContent, analyzeImageWithQwen } from './ai.js'
import { getDb } from './db.js'
import mammoth from 'mammoth'

function currentUserId(req: Request): string | null {
  return typeof req.authUser?.username === 'string' ? req.authUser.username : null
}

function isDeveloper(req: Request): boolean {
  return req.authUser?.role === 'developer'
}

function assertFileOwnership(req: Request, res: Response, metadata: FileMetadata | undefined): metadata is FileMetadata {
  if (!metadata) {
    res.status(404).json({ success: false, error: 'File not found' })
    return false
  }

  // Developer 可檢視所有檔案
  if (isDeveloper(req)) {
    return true
  }

  const ownerId = currentUserId(req)
  if (!ownerId) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return false
  }

  if (!metadata.userId) {
    res.status(403).json({ success: false, error: 'file-not-owned' })
    return false
  }

  if (metadata.userId !== ownerId) {
    res.status(403).json({ success: false, error: 'file-not-owned' })
    return false
  }

  return true
}

/**
 * POST /api/files/upload
 * 上傳多個檔案
 */
export async function handleFileUpload(req: Request, res: Response) {
  try {
    const { files, catId, descriptions } = req.body
    const ownerId = currentUserId(req)

    if (!ownerId && !isDeveloper(req)) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files provided',
      })
      return
    }

    if (files.length > 10) {
      res.status(400).json({
        success: false,
        error: 'Maximum 10 files allowed per request',
      })
      return
    }

    const parsedFiles: ParsedFile[] = []
    const resolvedCatId =
      typeof catId === 'string' && catId.trim().length > 0 ? catId.trim() : undefined

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file?.dataUrl || !file?.filename) {
        res.status(400).json({ success: false, error: `Invalid file payload at index ${i}` })
        return
      }
      try {
        parsedFiles.push(parseBase64File(file.dataUrl, file.filename))
      } catch (error) {
        res.status(400).json({
          success: false,
          error:
            error instanceof Error
              ? `${error.message} (file index ${i})`
              : `Invalid file at index ${i}`,
        })
        return
      }
    }

    const uploadedFiles: Array<{
      id: string
      filename: string
      fileType: string
      fileSize: number
    }> = []

    for (let i = 0; i < parsedFiles.length; i++) {
      try {
        const metadata = await saveFile(parsedFiles[i], ownerId ?? undefined, resolvedCatId)

        uploadedFiles.push({
          id: metadata.id,
          filename: metadata.filename,
          fileType: metadata.fileType,
          fileSize: metadata.fileSize,
        })

        console.log(
          `[fileApi] Uploaded file: ${metadata.id} (${metadata.fileType}, ${metadata.fileSize} bytes) owner=${metadata.userId ?? 'unknown'}`
        )
      } catch (error) {
        console.error(`[fileApi] Failed to upload file at index ${i}:`, error)
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        })
        return
      }
    }

    res.json({
      success: true,
      files: uploadedFiles,
    })
  } catch (error) {
    console.error('[fileApi] Upload error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    })
  }
}

/**
 * POST /api/files/:id/analyze
 * 分析特定檔案
  */
export async function handleFileAnalyze(req: Request, res: Response) {
  try {
    const rawId = req.params?.id
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Missing file id' })
      return
    }
    const id = rawId.trim()
    const { description, question, modelPreference } = req.body

    console.log(`[fileApi] Analyze request with modelPreference: ${modelPreference}`)

    const metadata = getFileMetadata(id)

    if (!assertFileOwnership(req, res, metadata)) {
      return
    }

    let analysisResult: any = null

    // 根據檔案類型執行不同的分析
    switch (metadata.fileType) {
      case 'image': {
        // 讀取圖片檔案
        const imageBuffer = await readFileBuffer(id)
        const base64Image = imageBuffer.toString('base64')

        // 使用 Vision API 分析
        const visionPrompt =
          (typeof question === 'string' && question.trim()) ||
          (typeof description === 'string' && description.trim()) ||
          '請描述這張圖片中的內容,特別注意貓咪的狀況和行為。'

        const visionResult = await analyzeImageWithQwen({
          imageBase64: base64Image,
          prompt: visionPrompt,
          language: 'zh',
        })

        analysisResult = {
          type: 'image',
          summary: visionResult.text || '無法分析圖片',
          details: visionResult,
        }
        break
      }

      case 'pdf': {
        // 提取 PDF 文字
        const extractedText = await extractTextFromPDF(id)

        // 🖼️ 提取 PDF 图片（新功能！）
        console.log(`[fileApi] Extracting images from PDF...`)
        const extractedImages = await extractImagesFromPDF(id).catch((err) => {
          console.warn(`[fileApi] Image extraction failed:`, err)
          return []
        })

        console.log(`[fileApi] Found ${extractedImages.length} images in PDF`)

        // 使用 Vision 模型分析每张图片
        const imageAnalyses: Array<{ pageNumber: number; analysis: string }> = []

        for (const image of extractedImages.slice(0, 5)) {
          // 限制最多分析5张图片
          try {
            const base64Image = imageToBase64(image.imageData)

            console.log(
              `[fileApi] Analyzing image ${image.index + 1} from page ${image.pageNumber} (${image.imageData.length} bytes)...`
            )

            const visionResult = await analyzeImageWithQwen({
              imageBase64: base64Image,
              prompt:
                '請描述這張圖片中的內容。如果是醫療相關圖片（如X光片、檢查報告、圖表等），請詳細說明你觀察到的醫療信息。',
              language: 'zh',
            })

            imageAnalyses.push({
              pageNumber: image.pageNumber,
              analysis: visionResult.text || '無法分析此圖片',
            })

            console.log(`[fileApi] ✓ Image ${image.index + 1} analyzed successfully`)
          } catch (err) {
            console.error(`[fileApi] Failed to analyze image ${image.index + 1}:`, err)
            imageAnalyses.push({
              pageNumber: image.pageNumber,
              analysis: '圖片分析失敗',
            })
          }
        }

        // 若文字與圖片皆無寵物相關內容則拒絕分析
        const hasPetContext = detectPetRelated(extractedText)
        if (!hasPetContext && imageAnalyses.length === 0) {
          res.status(400).json({
            success: false,
            error: 'pdf-not-pet-related',
          })
          return
        }

        // 合并文字和图片分析结果
        let fullContent = extractedText

        if (imageAnalyses.length > 0) {
          fullContent += '\n\n--- PDF中的圖片分析 ---\n'
          imageAnalyses.forEach((imgAnalysis) => {
            fullContent += `\n📷 頁面 ${imgAnalysis.pageNumber} 的圖片:\n${imgAnalysis.analysis}\n`
          })
        }

        if (!fullContent || fullContent.trim().length === 0) {
          analysisResult = {
            type: 'pdf',
            summary: 'PDF 檔案沒有可提取的文字或圖片內容',
            pageCount: 0,
            extractedText: '',
          }
          break
        }

        // 🚀 Ultra模式：使用双模型协作分析
        if (modelPreference === 'ultra') {
          console.log(`[fileApi] 🚀 Ultra mode activated: GPT-OSS + Qwen3-Thinking collaboration`)

          const ultraResult = await analyzePDFWithUltraMode(extractedText, imageAnalyses, question)

          analysisResult = {
            type: 'pdf',
            summary: ultraResult.finalAnalysis.substring(0, 500) + '...',
            pageCount: Math.ceil(extractedText.length / 2000),
            extractedText: extractedText.substring(0, 500) + '...',
            medicalInfo: undefined, // Ultra模式直接输出完整分析
            confidence: 0.95, // Ultra模式置信度更高
            imageCount: extractedImages.length,
            imageAnalyses: imageAnalyses.length > 0 ? imageAnalyses : undefined,
            ultraMode: {
              firstDraft: ultraResult.firstDraft.substring(0, 1000) + '...',
              review: ultraResult.review,
              finalAnalysis: ultraResult.finalAnalysis,
              durationMs: ultraResult.totalDurationMs,
            },
          }
        } else {
          // 使用 AI 分析 PDF 內容 - 標準/Pro模式
          let actualModelPreference: 'auto' | 'standard' | 'pro' = 'auto'
          let reasoningEffort: 'low' | 'medium' | 'high' = 'medium'

          if (modelPreference === 'pro') {
            actualModelPreference = 'pro'
            reasoningEffort = 'high'
          } else if (modelPreference === 'standard') {
            actualModelPreference = 'standard'
            reasoningEffort = 'low'
          } else {
            // auto
            actualModelPreference = 'auto'
            reasoningEffort = 'medium'
          }

          console.log(
            `[fileApi] Analyzing PDF with model: ${actualModelPreference}, reasoning: ${reasoningEffort}`
          )

          const generateFn = async (prompt: string) => {
            const result = await generateChatContent({
              question: prompt,
              language: 'zh',
              modelPreference: actualModelPreference,
              reasoningEffort: reasoningEffort,
              snapshot: null,
              history: [],
            })
            return result.text
          }

          const pdfAnalysis = await analyzePDFWithAI(fullContent, generateFn)

          analysisResult = {
            type: 'pdf',
            summary: pdfAnalysis.summary,
            pageCount: pdfAnalysis.pageCount,
            extractedText: extractedText.substring(0, 500) + '...',
            medicalInfo: pdfAnalysis.medicalInfo,
            confidence: 0.85,
            imageCount: extractedImages.length,
            imageAnalyses: imageAnalyses.length > 0 ? imageAnalyses : undefined,
          }
        }

        break
      }

      case 'docx': {
        // 先轉出文字
        const buffer = await readFileBuffer(id)
        const mammothResult = await mammoth.extractRawText({ buffer })
        const extractedText = (mammothResult.value || '').trim()

        // 寵物相關性檢查
        const hasPetContext = detectPetRelated(extractedText)
        if (!hasPetContext) {
          res.status(400).json({
            success: false,
            error: 'docx-not-pet-related',
          })
          return
        }

        // 模型選擇
        let actualModelPreference: 'auto' | 'standard' | 'pro' = 'auto'
        let reasoningEffort: 'low' | 'medium' | 'high' = 'medium'

        if (modelPreference === 'pro') {
          actualModelPreference = 'pro'
          reasoningEffort = 'high'
        } else if (modelPreference === 'standard') {
          actualModelPreference = 'standard'
          reasoningEffort = 'low'
        }

        const generateFn = async (prompt: string) => {
          const result = await generateChatContent({
            question: prompt,
            language: 'zh',
            modelPreference: actualModelPreference,
            reasoningEffort: reasoningEffort,
            snapshot: null,
            history: [],
          })
          return result.text
        }

        const analysis = await analyzePDFWithAI(extractedText, generateFn)
        analysisResult = {
          type: 'docx',
          summary: analysis.summary,
          pageCount: analysis.pageCount,
          extractedText: extractedText.slice(0, 500) + '...',
          medicalInfo: analysis.medicalInfo,
          confidence: 0.85,
        }

        break
      }

      case 'audio': {
        // 支持 ultra 模式
        let actualModelPreference: 'auto' | 'standard' | 'pro' = 'auto'
        let reasoningEffort: 'low' | 'medium' | 'high' = 'medium'

        if (modelPreference === 'ultra') {
          actualModelPreference = 'pro'
          reasoningEffort = 'high'
        } else if (modelPreference === 'pro') {
          actualModelPreference = 'pro'
          reasoningEffort = 'high'
        } else if (modelPreference === 'standard') {
          actualModelPreference = 'standard'
          reasoningEffort = 'low'
        }

        const audioAnalysis = await analyzeAudioWithAI(
          id,
          (typeof question === 'string' && question) ||
            (typeof description === 'string' && description) ||
            '請分析這段音訊中貓咪的情緒和行為',
          async (prompt: string) => {
            const result = await generateChatContent({
              question: prompt,
              language: 'zh',
              modelPreference: actualModelPreference,
              reasoningEffort: reasoningEffort,
              snapshot: null,
              history: [],
            })
            return result.text
          }
        )

        analysisResult = {
          type: 'audio',
          summary: audioAnalysis.interpretation,
          emotions: [audioAnalysis.emotionalTone],
          confidence: audioAnalysis.confidence,
          recommendations: audioAnalysis.recommendations,
        }
        break
      }

      case 'video': {
        // 支持 ultra 模式
        let actualModelPreference: 'auto' | 'standard' | 'pro' = 'auto'
        let reasoningEffort: 'low' | 'medium' | 'high' = 'medium'

        if (modelPreference === 'ultra') {
          actualModelPreference = 'pro'
          reasoningEffort = 'high'
        } else if (modelPreference === 'pro') {
          actualModelPreference = 'pro'
          reasoningEffort = 'high'
        } else if (modelPreference === 'standard') {
          actualModelPreference = 'standard'
          reasoningEffort = 'low'
        }

        const videoAnalysis = await analyzeVideoWithAI(
          id,
          (typeof question === 'string' && question) ||
            (typeof description === 'string' && description) ||
            '請分析這段影片中貓咪的行為和狀況',
          async (prompt: string) => {
            const result = await generateChatContent({
              question: prompt,
              language: 'zh',
              modelPreference: actualModelPreference,
              reasoningEffort: reasoningEffort,
              snapshot: null,
              history: [],
            })
            return result.text
          }
        )

        analysisResult = {
          type: 'video',
          summary: videoAnalysis.behaviorSummary,
          behaviors: videoAnalysis.activities,
          confidence: videoAnalysis.activities[0]?.confidence ?? 0,
          recommendations: videoAnalysis.recommendations,
        }
        break
      }

      default:
        res.status(400).json({
          success: false,
          error: `Unsupported file type: ${metadata.fileType}`,
        })
        return
    }

    // 更新分析結果到資料庫
    if (analysisResult) {
      updateAnalysisResult(id, analysisResult)
    }

    res.json({
      success: true,
      analysis: analysisResult,
    })
  } catch (error) {
    console.error('[fileApi] Analysis error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    })
  }
}

/**
 * GET /api/files
 * 取得檔案列表
 */
export async function handleFileList(req: Request, res: Response) {
  try {
    const { catId, type, limit = '50' } = req.query
    const ownerId = currentUserId(req)
    const developer = isDeveloper(req)

    if (!developer && !ownerId) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }

    const limitNum = parseInt(limit as string, 10)
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      res.status(400).json({
        success: false,
        error: 'Invalid limit parameter (must be 1-200)',
      })
      return
    }

    const db = getDb()

    const clauses: string[] = ['1=1']
    const params: any[] = []

    if (developer) {
      const requestedOwner =
        typeof req.query.userId === 'string' && req.query.userId.trim().length > 0
          ? req.query.userId.trim()
          : undefined
      if (requestedOwner) {
        clauses.push('user_id = ?')
        params.push(requestedOwner)
      }
    } else {
      clauses.push('user_id = ?')
      params.push(ownerId)
    }

    const catFilter = typeof catId === 'string' && catId.trim().length > 0 ? catId.trim() : null
    if (catFilter) {
      clauses.push('cat_id = ?')
      params.push(catFilter)
    }

    const typeFilter = typeof type === 'string' && type.trim().length > 0 ? type.trim() : null
    if (typeFilter) {
      clauses.push('file_type = ?')
      params.push(typeFilter)
    }

    const query = `
      SELECT
        id, user_id, cat_id, filename, mime_type, file_type,
        file_size, storage_path, analysis_result, uploaded_at
      FROM file_uploads
      WHERE ${clauses.join(' AND ')}
      ORDER BY uploaded_at DESC
      LIMIT ?
    `
    params.push(limitNum)

    const rows = db.prepare(query).all(...params) as any[]

    const files: FileMetadata[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      catId: row.cat_id,
      filename: row.filename,
      mimeType: row.mime_type,
      fileType: row.file_type,
      fileSize: row.file_size,
      storagePath: row.storage_path,
      analysisResult: row.analysis_result ? JSON.parse(row.analysis_result) : undefined,
      uploadedAt: new Date(row.uploaded_at),
    }))

    res.json({
      success: true,
      files,
      count: files.length,
    })
  } catch (error) {
    console.error('[fileApi] List error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
    })
  }
}

/**
 * DELETE /api/files/:id
 * 刪除檔案
 */
  export async function handleFileDelete(req: Request, res: Response) {
  try {
    const rawId = req.params?.id
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Missing file id' })
      return
    }
    const id = rawId.trim()

    const metadata = getFileMetadata(id)

    if (!assertFileOwnership(req, res, metadata)) {
      return
    }

    await deleteFileFromStorage(id)

    console.log(`[fileApi] Deleted file: ${id}`)

    res.json({
      success: true,
      message: 'File deleted successfully',
    })
  } catch (error) {
    console.error('[fileApi] Delete error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    })
  }
}

/**
 * GET /api/files/:id/download
 * 下載檔案
 */
  export async function handleFileDownload(req: Request, res: Response) {
  try {
    const rawId = req.params?.id
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Missing file id' })
      return
    }
    const id = rawId.trim()

    const metadata = getFileMetadata(id)

    if (!assertFileOwnership(req, res, metadata)) {
      return
    }

    const fileBuffer = await readFileBuffer(id)

    res.setHeader('Content-Type', metadata.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`)
    res.setHeader('Content-Length', fileBuffer.length)

    res.send(fileBuffer)
  } catch (error) {
    console.error('[fileApi] Download error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    })
  }
}
