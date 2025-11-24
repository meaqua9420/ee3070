// PDF 解析模組
import { readFile } from './fileHandler.js'
// Note: pdf-parse is a CommonJS module, will be imported dynamically

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

// 使用 pdf-parse 專業庫提取 PDF 文字
// 支援各種 PDF 格式,包括複雜編碼、字體嵌入、壓縮等
export async function extractTextFromPDF(fileId: string): Promise<string> {
  try {
    const buffer = await readFile(fileId)

    // 動態導入 pdf-parse (CommonJS 模塊)
    const pdfParseModule = (await import('pdf-parse')) as any
    // 兼容 default / module.exports / PDFParse
    const pdfParseFn =
      typeof pdfParseModule?.default === 'function'
        ? pdfParseModule.default
        : typeof pdfParseModule === 'function'
          ? pdfParseModule
          : null

    let pdfData: any = null

    if (pdfParseFn) {
      // 舊版/常見 API：直接呼叫函式
      pdfData = await pdfParseFn(buffer, {
        max: 50 * 1024 * 1024,
        version: 'default',
      })
    } else if (pdfParseModule?.PDFParse) {
      // 新版 API：PDFParse 為 class，需先 new 再調用 getText()
      const parser = new pdfParseModule.PDFParse({ data: buffer })
      if (typeof parser.getText === 'function') {
        pdfData = await parser.getText({
          max: 50 * 1024 * 1024,
          version: 'default',
        })
      } else if (typeof parser.parse === 'function') {
        pdfData = await parser.parse({
          max: 50 * 1024 * 1024,
          version: 'default',
        })
      } else {
        // 嘗試函式化調用
        pdfData = await pdfParseModule.PDFParse(buffer, {
          max: 50 * 1024 * 1024,
          version: 'default',
        })
      }
    } else {
      throw new Error('pdf-parse module not loaded correctly')
    }

    // pdf-parse 返回的資料結構:
    // - text: 提取的所有文字內容
    // - numpages: 頁數
    // - info: PDF 元資料 (標題、作者、建立日期等)
    // - metadata: XMP 元資料

    // 清理提取的文字
    let extractedText = pdfData.text.trim()

    // 移除多餘的空白和換行
    extractedText = extractedText
      .replace(/\r\n/g, '\n')  // 統一換行符
      .replace(/\n{3,}/g, '\n\n')  // 最多保留兩個連續換行
      .replace(/ {2,}/g, ' ')  // 移除多餘空格

    // 檢查是否成功提取文字
    if (!extractedText || extractedText.length < 10) {
      console.warn(`[PDF] Extracted text too short (${extractedText.length} chars), PDF may be scanned or image-based`)
      return ''
    }

    console.log(`[PDF] Successfully extracted ${extractedText.length} characters from ${pdfData.numpages} pages`)

    return extractedText
  } catch (error) {
    console.error('[PDF] Text extraction error:', error)
    // 提供更詳細的錯誤訊息
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF')) {
        throw new Error('無效的 PDF 文件格式')
      } else if (error.message.includes('Encrypted')) {
        throw new Error('PDF 文件已加密,無法提取文字')
      }
    }
    throw new Error('無法從 PDF 提取文字,文件可能已損壞或為掃描版')
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

// 檢查是否與寵物/貓狗鳥照護相關
export function detectPetRelated(text: string): boolean {
  const petKeywords = [
    // 中文
    '貓', '貓咪', '犬', '狗', '寵物', '鳥', '鸚鵡', '貓砂', '貓砂盆', '餵食', '飲水',
    '寵物屋', '智慧貓屋', '貓砂清理', '貓咪健康', '獸醫',
    // 英文
    'cat', 'feline', 'kitty', 'dog', 'canine', 'pet', 'bird', 'parrot',
    'litter', 'litter box', 'feeder', 'water bowl', 'hydration', 'vet', 'veterinarian',
  ]

  const lowerText = text.toLowerCase()
  let matchCount = 0
  for (const keyword of petKeywords) {
    if (keyword && lowerText.includes(keyword.toLowerCase())) {
      matchCount++
    }
  }
  // 至少找到 2 個關鍵詞才視為相關
  return matchCount >= 2
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

// 完整的 PDF 分析流程 (改進版本,獲取完整元資料)
export async function analyzePDF(
  fileId: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<PDFAnalysisResult> {
  // 1. 提取文字和元資料
  const buffer = await readFile(fileId)

  // 動態導入 pdf-parse (CommonJS 模塊)
  // pdf-parse 導出 PDFParse 命名導出
  const pdfParseModule = await import('pdf-parse') as any
  const pdfParse = pdfParseModule.PDFParse

  const pdfData = await pdfParse(buffer, {
    max: 50 * 1024 * 1024,
    version: 'default'
  })

  const extractedText = pdfData.text.trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')

  if (!extractedText || extractedText.length < 10) {
    throw new Error('PDF appears to be empty or unreadable (可能是掃描版或圖片型 PDF)')
  }

  console.log(`[PDF] Analyzing PDF: ${pdfData.numpages} pages, ${extractedText.length} characters`)

  // 2. 使用 AI 分析
  const analysis = await analyzePDFWithAI(extractedText, generateFn)

  // 3. 使用真實的頁數 (來自 pdf-parse)
  analysis.pageCount = pdfData.numpages

  // 4. 增強分析結果 - 醫療報告檢測
  if (detectMedicalReport(extractedText)) {
    // 如果 AI 沒有檢測到醫療資訊,嘗試手動提取
    if (!analysis.medicalInfo) {
      const dates = extractDates(extractedText)
      if (dates.length > 0) {
        analysis.medicalInfo = { dates }
      }
    }
  }

  // 5. 添加 PDF 元資料 (從 pdf-parse 獲取)
  analysis.metadata = {
    title: pdfData.info?.Title,
    author: pdfData.info?.Author,
    creationDate: pdfData.info?.CreationDate,
    keywords: extractKeywords(extractedText)
  }

  console.log(`[PDF] Analysis complete: ${analysis.pageCount} pages, medical: ${!!analysis.medicalInfo}`)

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
