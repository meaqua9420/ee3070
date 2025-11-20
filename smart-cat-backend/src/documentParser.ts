import mammoth from 'mammoth'
import { parseBase64File, saveFile, updateAnalysisResult, type FileMetadata } from './fileHandler.js'
import { extractTextFromPDF, extractKeywords, estimatePageCount } from './pdfParser.js'

export interface DocumentAnalysisResult {
  summary: string
  extractedText: string
  keywords: string[]
  pageCount: number
  documentType: 'pdf' | 'word'
  filename: string
}

export async function extractTextFromWordBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

function buildDocumentSummary(text: string, info: { filename: string; pageCount?: number }): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const summary = paragraphs.slice(0, 3).join(' ').trim() || text.substring(0, 500)

  const extras: string[] = []
  if (info.pageCount) {
    extras.push(`共 ${info.pageCount} 頁`)
  }
  if (info.filename) {
    extras.push(`檔名：${info.filename}`)
  }

  return `${summary}${extras.length ? `\n\n${extras.join(' · ')}` : ''}`
}

export async function analyzeDocumentAttachment(params: {
  dataUrl: string
  mimeType: string
  filename: string
  userId?: string
  catId?: string
}): Promise<{ metadata: FileMetadata; analysis: DocumentAnalysisResult }> {
  const { dataUrl, mimeType, filename, userId, catId } = params
  const parsedFile = parseBase64File(dataUrl, filename)
  const metadata = await saveFile(parsedFile, userId, catId)

  let extractedText = ''
  let documentType: 'pdf' | 'word' = 'pdf'

  if (mimeType === 'application/pdf') {
    extractedText = await extractTextFromPDF(metadata.id)
    documentType = 'pdf'
  } else {
    extractedText = await extractTextFromWordBuffer(
      Buffer.isBuffer(parsedFile.data) ? parsedFile.data : Buffer.from(parsedFile.data as string, 'base64'),
    )
    documentType = 'word'
  }

  const pageCount = estimatePageCount(extractedText)
  const keywords = extractKeywords(extractedText, 8)
  const summary = buildDocumentSummary(extractedText, { filename, pageCount })
  const analysis: DocumentAnalysisResult = {
    summary,
    extractedText,
    keywords,
    pageCount,
    documentType,
    filename,
  }

  await updateAnalysisResult(metadata.id, {
    summary,
    keywords,
    documentType,
    pageCount,
    extractedText,
  })

  return { metadata, analysis }
}
