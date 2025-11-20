// PDF 解析模組
import { readFile } from './fileHandler.js'

export interface PDFAnalysisResult {
  pageCount: number
  extractedText: string
  summary: string
  medicalInfo?: {
    diagnosis?: string[]
    medications?: string[]
    recommendations?: string[]
    dates?: string[]
    veterinarian?: string
    clinic?: string
  }
  metadata?: {
    title?: string
    author?: string
    creationDate?: string
    keywords?: string[]
  }
}

// 簡易 PDF 文字提取 (使用正則表達式)
// 注意: 這是簡化版本,生產環境建議使用 pdf-parse 或 pdfjs-dist
export async function extractTextFromPDF(fileId: string): Promise<string> {
  try {
    const buffer = await readFile(fileId)

    // 簡單的 PDF 文字提取 (尋找 stream 物件中的文字)
    const text = buffer.toString('latin1')

    // 提取所有可能的文字內容
    const textMatches = text.match(/\(([^)]+)\)/g)

    if (!textMatches) {
      return ''
    }

    let extractedText = ''
    for (const match of textMatches) {
      const content = match.slice(1, -1) // 移除括號
      // 解碼 PDF 編碼
      const decoded = content
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\([()])/g, '$1')

      extractedText += decoded + ' '
    }

    return extractedText.trim()
  } catch (error) {
    console.error('PDF text extraction error:', error)
    throw new Error('Failed to extract text from PDF')
  }
}

// 使用 AI 分析 PDF 內容
export async function analyzePDFWithAI(
  extractedText: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<PDFAnalysisResult> {
  // 如果文字過長,截取前 4000 字
  const textToAnalyze = extractedText.slice(0, 4000)

  const prompt = `請分析以下 PDF 文件內容,並以 JSON 格式回覆:

文件內容:
${textToAnalyze}

請提取以下資訊:
1. 文件摘要 (summary): 3-5 句話總結文件內容
2. 如果是醫療報告,請提取:
   - 診斷 (diagnosis): 陣列格式
   - 處方藥物 (medications): 陣列格式
   - 醫療建議 (recommendations): 陣列格式
   - 相關日期 (dates): 陣列格式
   - 獸醫姓名 (veterinarian): 字串
   - 診所名稱 (clinic): 字串

回覆格式:
{
  "summary": "文件摘要",
  "medicalInfo": {
    "diagnosis": ["診斷1", "診斷2"],
    "medications": ["藥物1", "藥物2"],
    "recommendations": ["建議1", "建議2"],
    "dates": ["2025-11-10"],
    "veterinarian": "獸醫姓名",
    "clinic": "診所名稱"
  }
}

如果不是醫療報告,medicalInfo 可以省略。`

  try {
    const aiResponse = await generateFn(prompt)

    // 嘗試解析 JSON 回覆
    let parsed: any
    try {
      // 提取 JSON 部分 (處理可能包含其他文字的情況)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (e) {
      // 如果無法解析 JSON,使用簡單摘要
      parsed = {
        summary: aiResponse.slice(0, 500)
      }
    }

    const result: PDFAnalysisResult = {
      pageCount: estimatePageCount(extractedText),
      extractedText: extractedText,
      summary: parsed.summary || 'PDF 文件已成功解析',
      medicalInfo: parsed.medicalInfo
    }

    return result
  } catch (error) {
    console.error('PDF AI analysis error:', error)

    // 回傳基本結果
    return {
      pageCount: estimatePageCount(extractedText),
      extractedText: extractedText,
      summary: '無法自動分析 PDF 內容,但文字已成功提取'
    }
  }
}

// 快速檢測是否為醫療報告
export function detectMedicalReport(text: string): boolean {
  const medicalKeywords = [
    // 中文
    '診斷', '處方', '藥物', '治療', '獸醫', '動物醫院', '檢查結果',
    '血液檢查', '尿液檢查', '體溫', '心率', '呼吸', '症狀',
    // 英文
    'diagnosis', 'prescription', 'medication', 'treatment', 'veterinarian',
    'vet', 'clinic', 'examination', 'blood test', 'urinalysis',
    'temperature', 'heart rate', 'respiratory', 'symptoms'
  ]

  const lowerText = text.toLowerCase()
  let matchCount = 0

  for (const keyword of medicalKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchCount++
    }
  }

  // 如果匹配 3 個以上關鍵字,認為是醫療報告
  return matchCount >= 3
}

// 估算頁數 (基於文字長度)
export function estimatePageCount(text: string): number {
  const avgCharsPerPage = 2000 // 假設每頁平均 2000 字元
  return Math.ceil(text.length / avgCharsPerPage)
}

// 提取日期
export function extractDates(text: string): string[] {
  const dates: string[] = []

  // 匹配各種日期格式
  const datePatterns = [
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/g,  // 2025-11-10 或 2025/11/10
    /\d{1,2}[-/]\d{1,2}[-/]\d{4}/g,  // 10-11-2025 或 10/11/2025
    /\d{4}年\d{1,2}月\d{1,2}日/g      // 2025年11月10日
  ]

  for (const pattern of datePatterns) {
    const matches = text.match(pattern)
    if (matches) {
      dates.push(...matches)
    }
  }

  // 去重並排序
  return Array.from(new Set(dates)).sort()
}

// 提取關鍵字
export function extractKeywords(text: string, topN: number = 10): string[] {
  // 簡單的關鍵字提取 (基於詞頻)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2) // 過濾太短的詞

  // 計算詞頻
  const freq: Record<string, number> = {}
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1
  }

  // 排序並取前 N 個
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word)

  return sorted
}

// 完整的 PDF 分析流程
export async function analyzePDF(
  fileId: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<PDFAnalysisResult> {
  // 1. 提取文字
  const extractedText = await extractTextFromPDF(fileId)

  if (!extractedText || extractedText.length < 10) {
    throw new Error('PDF appears to be empty or unreadable')
  }

  // 2. 使用 AI 分析
  const analysis = await analyzePDFWithAI(extractedText, generateFn)

  // 3. 增強分析結果
  if (detectMedicalReport(extractedText)) {
    // 如果 AI 沒有檢測到醫療資訊,嘗試手動提取
    if (!analysis.medicalInfo) {
      const dates = extractDates(extractedText)
      if (dates.length > 0) {
        analysis.medicalInfo = { dates }
      }
    }
  }

  // 4. 添加元資料
  analysis.metadata = {
    keywords: extractKeywords(extractedText)
  }

  return analysis
}

// 生成使用者友善的摘要
export function generatePDFSummary(analysis: PDFAnalysisResult): string {
  let summary = analysis.summary

  if (analysis.medicalInfo) {
    summary += '\n\n📋 醫療資訊摘要:\n'

    if (analysis.medicalInfo.diagnosis && analysis.medicalInfo.diagnosis.length > 0) {
      summary += `\n🔬 診斷: ${analysis.medicalInfo.diagnosis.join(', ')}`
    }

    if (analysis.medicalInfo.medications && analysis.medicalInfo.medications.length > 0) {
      summary += `\n💊 藥物: ${analysis.medicalInfo.medications.join(', ')}`
    }

    if (analysis.medicalInfo.recommendations && analysis.medicalInfo.recommendations.length > 0) {
      summary += `\n✅ 建議: ${analysis.medicalInfo.recommendations.join('; ')}`
    }

    if (analysis.medicalInfo.dates && analysis.medicalInfo.dates.length > 0) {
      summary += `\n📅 日期: ${analysis.medicalInfo.dates.join(', ')}`
    }

    if (analysis.medicalInfo.veterinarian) {
      summary += `\n👨‍⚕️ 獸醫: ${analysis.medicalInfo.veterinarian}`
    }

    if (analysis.medicalInfo.clinic) {
      summary += `\n🏥 診所: ${analysis.medicalInfo.clinic}`
    }
  }

  summary += `\n\n📄 共 ${analysis.pageCount} 頁`

  return summary
}
