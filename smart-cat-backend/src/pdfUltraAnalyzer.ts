/**
 * PDF Ultra模式分析器 - 双模型协作
 * PDF Ultra Mode Analyzer - Dual-Model Collaboration
 *
 * 工作流程:
 * 1. GPT-OSS (Pro) 生成初步分析
 * 2. Qwen3-Thinking (Standard) 审查并提供反馈
 * 3. GPT-OSS (Pro) 根据反馈优化最终输出
 */

import { generateChatContent } from './ai.js'

export interface UltraPDFAnalysisResult {
  firstDraft: string
  review: {
    approved: boolean
    concerns: string[]
    feedback: string
    strengths: string[]
    rawResponse?: string
    parseSuccess?: boolean
  }
  finalAnalysis: string
  totalDurationMs: number
  usedFallback?: boolean
}

/**
 * 使用Ultra模式分析PDF (双模型协作)
 */
export async function analyzePDFWithUltraMode(
  extractedText: string,
  imageAnalyses: Array<{ pageNumber: number; analysis: string }>,
  question?: string
): Promise<UltraPDFAnalysisResult> {
  const startTime = Date.now()

  // 构建完整的PDF内容
  let fullContent = extractedText

  if (imageAnalyses.length > 0) {
    fullContent += '\n\n--- PDF中的圖片分析 ---\n'
    imageAnalyses.forEach((imgAnalysis) => {
      fullContent += `\n📷 頁面 ${imgAnalysis.pageNumber} 的圖片:\n${imgAnalysis.analysis}\n`
    })
  }

  // === 阶段1: GPT-OSS 生成初稿 ===
  console.log('[Ultra PDF] Phase 1: GPT-OSS generating first draft...')

  const proPrompt = buildProAnalysisPrompt(fullContent, question)

  const firstDraftResult = await generateChatContent({
    question: proPrompt,
    language: 'zh',
    modelPreference: 'pro', // 使用 GPT-OSS
    reasoningEffort: 'high',
  })

  const firstDraft = firstDraftResult.text

  console.log(`[Ultra PDF] Phase 1 complete. Draft length: ${firstDraft.length} chars`)

  // === 阶段2: Qwen3-Thinking 审查 ===
  console.log('[Ultra PDF] Phase 2: Qwen3-Thinking reviewing draft...')

  const reviewPrompt = buildReviewPrompt(firstDraft)

  const reviewResult = await generateChatContent({
    question: reviewPrompt,
    language: 'zh',
    modelPreference: 'standard', // 使用 Qwen3-Thinking
    reasoningEffort: 'medium',
  })

  // 解析审查结果
  const review = parseReviewJSON(reviewResult.text)

  console.log(
    `[Ultra PDF] Phase 2 complete. Approved: ${review.approved}, Concerns: ${review.concerns.length}, Parse success: ${review.parseSuccess ?? false}`
  )

  let finalAnalysis: string
  let usedFallback = false

  // === 容錯機制：如果審查解析失敗，直接使用初稿 ===
  if (review.parseSuccess === false) {
    console.warn('[Ultra PDF] ⚠️  Review parsing failed, using first draft as final analysis (skipping Phase 3)')

    finalAnalysis = firstDraft
    usedFallback = true

    const totalDurationMs = Date.now() - startTime

    return {
      firstDraft,
      review,
      finalAnalysis,
      totalDurationMs,
      usedFallback
    }
  }

  // === 阶段3: GPT-OSS 优化最终输出 ===
  console.log('[Ultra PDF] Phase 3: GPT-OSS refining final analysis...')

  const rethinkPrompt = buildRethinkPrompt(fullContent, firstDraft, review, question)

  const finalResult = await generateChatContent({
    question: rethinkPrompt,
    language: 'zh',
    modelPreference: 'pro', // 再次使用 GPT-OSS
    reasoningEffort: 'high',
  })

  finalAnalysis = finalResult.text

  const totalDurationMs = Date.now() - startTime

  console.log(
    `[Ultra PDF] Phase 3 complete. Total duration: ${totalDurationMs}ms (${(totalDurationMs / 1000).toFixed(1)}s)`
  )

  return {
    firstDraft,
    review,
    finalAnalysis,
    totalDurationMs,
    usedFallback
  }
}

/**
 * 构建Pro模型的初步分析提示词
 */
function buildProAnalysisPrompt(pdfContent: string, userQuestion?: string): string {
  const question = userQuestion || '請詳細分析這份PDF文件'

  return `你是一位專業的文檔分析專家。請仔細分析以下PDF文件內容。

PDF內容:
${pdfContent.substring(0, 6000)} ${pdfContent.length > 6000 ? '...(內容過長已截斷)' : ''}

用戶問題: ${question}

請提供以下分析:
1. 📋 **文檔摘要** (3-5句話概述)
2. 🔍 **關鍵發現** (列出最重要的3-5個要點)
3. 📊 **詳細分析**
   - 如果是醫療報告：診斷、用藥、建議、注意事項
   - 如果包含圖片：結合圖片內容綜合分析
4. 💡 **實用建議** (具體可行的3-5條建議)

要求:
- 使用繁體中文
- 條理清晰，使用項目符號
- 如有醫療資訊，務必嚴謹準確
- 如有圖片分析，請與文字內容相互印證`
}

/**
 * 構建審查提示詞 (給Qwen3-Thinking)
 */
function buildReviewPrompt(firstDraft: string): string {
  return `🚨 絕對重要：你的回應必須是純 JSON 格式，絕對不要包含任何說明文字、前言或後綴。

你的任務：審核以下PDF分析報告的品質

評估角度：
1. 準確性：是否有錯誤資訊或過度推測？
2. 完整性：醫療/技術資訊是否齊全？
3. 清晰度：結構和語言是否易懂？
4. 可操作性：建議是否具體可行？
5. 安全性：是否遺漏風險提醒？

📋 範例輸出格式（請完全遵循此格式）：
{"approved":true,"concerns":["建議補充具體數值","可增加注意事項"],"feedback":"整體分析詳盡，建議加強風險說明","strengths":["醫療資訊準確","建議具體可行"]}

⚠️ 輸出規則：
- 第一個字元必須是 {
- 最後一個字元必須是 }
- 不要有任何其他文字
- 使用繁體中文
- concerns 和 strengths 必須是陣列
- 如果沒有 concerns，使用空陣列 []

待審核的分析報告：
${firstDraft.substring(0, 4000)} ${firstDraft.length > 4000 ? '...(報告過長已截斷)' : ''}

請立即輸出 JSON（不要有任何說明）：`
}

/**
 * 構建重新思考提示詞 (給GPT-OSS)
 */
function buildRethinkPrompt(
  pdfContent: string,
  firstDraft: string,
  review: { approved: boolean; concerns: string[]; feedback: string; strengths: string[] },
  userQuestion?: string
): string {
  const question = userQuestion || '請詳細分析這份PDF文件'

  return `你之前對PDF文件做了初步分析，現在收到了審核反饋。請優化你的分析。

原始PDF內容:
${pdfContent.substring(0, 3000)}...

原始問題: ${question}

你的初稿分析:
${firstDraft.substring(0, 2000)}...

審核反饋:
${JSON.stringify(review, null, 2)}

請根據反饋**優化你的分析**:
1. ✅ 保留你做得好的部分 (strengths)
2. ⚠️ 針對每個concern進行改善
3. 💡 採納feedback中的建議
4. 🎯 確保分析更準確、更完整、更實用

輸出要求:
- 使用繁體中文
- 保持清晰的結構 (摘要、關鍵發現、詳細分析、建議)
- 如果是醫療報告，務必嚴謹
- 結尾邀請用戶提供更多資訊或問題`
}

/**
 * 解析審查JSON（改進版：支援多種格式）
 */
function parseReviewJSON(reviewText: string): {
  approved: boolean
  concerns: string[]
  feedback: string
  strengths: string[]
  rawResponse?: string
  parseSuccess?: boolean
} {
  console.log(`[Ultra PDF] Parsing review response (${reviewText.length} chars)`)

  // 儲存原始回應供調試
  const rawResponse = reviewText.substring(0, 500)

  try {
    // 策略1: 尋找最外層的 JSON 物件（非貪婪匹配）
    const jsonMatch1 = reviewText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)

    // 策略2: 尋找第一個 { 到最後一個 } 之間的內容
    const firstBrace = reviewText.indexOf('{')
    const lastBrace = reviewText.lastIndexOf('}')

    // 策略3: 移除所有前後空白和說明文字
    const cleaned = reviewText.trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '')

    const attempts = [
      { name: 'strategy1', text: jsonMatch1?.[0] },
      { name: 'strategy2', text: firstBrace >= 0 && lastBrace > firstBrace ? reviewText.substring(firstBrace, lastBrace + 1) : null },
      { name: 'strategy3', text: cleaned },
      { name: 'direct', text: reviewText }
    ]

    for (const attempt of attempts) {
      if (!attempt.text) continue

      try {
        const parsed = JSON.parse(attempt.text)

        // 驗證必要欄位
        if (typeof parsed === 'object' && parsed !== null) {
          console.log(`[Ultra PDF] ✓ JSON parsed successfully using ${attempt.name}`)

          return {
            approved: parsed.approved ?? true,
            concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
            feedback: parsed.feedback || '無特別建議',
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
            rawResponse,
            parseSuccess: true
          }
        }
      } catch (e) {
        // 繼續嘗試下一個策略
        continue
      }
    }

    console.warn('[Ultra PDF] All JSON parsing strategies failed')
    console.warn('[Ultra PDF] Raw response preview:', rawResponse)

  } catch (error) {
    console.error('[Ultra PDF] Unexpected error during JSON parsing:', error)
  }

  // 解析失敗時的默認值
  return {
    approved: true,
    concerns: [],
    feedback: '審核解析失敗，使用初稿',
    strengths: ['分析詳盡'],
    rawResponse,
    parseSuccess: false
  }
}
