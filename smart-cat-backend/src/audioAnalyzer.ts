// 音訊分析模組 - 貓叫聲情緒和行為識別
import { readFile } from './fileHandler.js'

export interface AudioAnalysisResult {
  duration: number  // 秒
  emotionalTone: 'distressed' | 'content' | 'playful' | 'hungry' | 'attention-seeking' | 'pain' | 'normal'
  confidence: number  // 0-1
  patterns: Array<{
    type: 'meow' | 'purr' | 'hiss' | 'growl' | 'chirp' | 'trill' | 'yowl' | 'caterwaul'
    timestamp: number  // 秒
    duration: number   // 秒
    intensity: number  // 0-1
    frequency?: string  // 'low' | 'medium' | 'high'
  }>
  urgency: 'low' | 'medium' | 'high'
  interpretation: string
  recommendations?: string[]
}

// 基於啟發式的簡易音訊分析
// 注意: 這是簡化版本,生產環境建議使用機器學習模型
export async function analyzeAudioHeuristic(fileId: string): Promise<AudioAnalysisResult> {
  try {
    const buffer = await readFile(fileId)

    // 估算音訊長度 (基於檔案大小和常見比特率)
    // 假設 MP3 128kbps: 1 秒 ≈ 16KB
    const estimatedDuration = buffer.length / (16 * 1024)

    // 簡化版本: 基於檔案大小和一些啟發式規則
    const analysis: AudioAnalysisResult = {
      duration: Math.max(0.5, estimatedDuration),
      emotionalTone: 'normal',
      confidence: 0.5,
      patterns: [],
      urgency: 'low',
      interpretation: '音訊已接收,但需要更詳細的分析。建議上傳影片或描述貓咪的行為狀態以獲得更準確的評估。'
    }

    // 基本啟發式: 較大的檔案可能包含更多內容
    if (estimatedDuration > 10) {
      analysis.urgency = 'medium'
      analysis.interpretation = '較長的音訊記錄。如果貓咪持續發出叫聲,可能需要關注其需求。'
    }

    return analysis
  } catch (error) {
    console.error('Audio analysis error:', error)
    throw new Error('Failed to analyze audio file')
  }
}

// 使用 AI 分析音訊描述
export async function analyzeAudioWithAI(
  fileId: string,
  userDescription: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<AudioAnalysisResult> {
  // 先做基本分析
  const basicAnalysis = await analyzeAudioHeuristic(fileId)

  // 如果使用者提供了描述,使用 AI 分析
  if (userDescription) {
    const prompt = `作為貓咪行為專家,請分析以下貓咪叫聲的描述,並以 JSON 格式回覆:

使用者描述: ${userDescription}

請判斷:
1. 情緒語調 (emotionalTone): 從以下選擇一個
   - distressed (痛苦/不適)
   - content (滿足/放鬆)
   - playful (玩耍/興奮)
   - hungry (飢餓)
   - attention-seeking (尋求注意)
   - pain (疼痛)
   - normal (正常)

2. 緊急程度 (urgency): low, medium, high

3. 解釋 (interpretation): 2-3 句話解釋貓咪可能的狀態

4. 建議 (recommendations): 給飼主的建議清單

5. 可能的叫聲類型 (patterns):
   - meow (喵叫)
   - purr (呼嚕)
   - hiss (嘶嘶聲)
   - growl (低吼)
   - chirp (唧唧聲)
   - trill (顫音)
   - yowl (嚎叫)
   - caterwaul (哀嚎)

回覆格式:
{
  "emotionalTone": "選項",
  "urgency": "low/medium/high",
  "interpretation": "解釋文字",
  "recommendations": ["建議1", "建議2"],
  "patterns": [{"type": "meow", "intensity": 0.7}],
  "confidence": 0.85
}`

    try {
      const aiResponse = await generateFn(prompt)

      // 解析 AI 回覆
      let parsed: any
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e)
        parsed = {}
      }

      // 合併 AI 分析和基本分析
      const enhancedAnalysis: AudioAnalysisResult = {
        ...basicAnalysis,
        emotionalTone: parsed.emotionalTone || basicAnalysis.emotionalTone,
        urgency: parsed.urgency || basicAnalysis.urgency,
        interpretation: parsed.interpretation || basicAnalysis.interpretation,
        recommendations: parsed.recommendations,
        confidence: parsed.confidence || 0.7
      }

      // 處理 patterns
      if (parsed.patterns && Array.isArray(parsed.patterns)) {
        enhancedAnalysis.patterns = parsed.patterns.map((p: any) => ({
          type: p.type || 'meow',
          timestamp: p.timestamp || 0,
          duration: p.duration || 1,
          intensity: p.intensity || 0.5,
          frequency: p.frequency
        }))
      }

      return enhancedAnalysis
    } catch (error) {
      console.error('AI audio analysis error:', error)
      return basicAnalysis
    }
  }

  return basicAnalysis
}

// 貓叫聲類型說明
export const CAT_VOCALIZATION_GUIDE: Record<string, {
  name: string
  description: string
  commonMeanings: string[]
}> = {
  meow: {
    name: '喵叫',
    description: '最常見的貓叫聲,通常用於與人類溝通',
    commonMeanings: [
      '打招呼',
      '請求食物或注意',
      '表達需求',
      '友好互動'
    ]
  },
  purr: {
    name: '呼嚕聲',
    description: '低頻振動聲,通常表示滿足',
    commonMeanings: [
      '放鬆和滿足',
      '自我安慰 (有時在疼痛時)',
      '請求撫摸',
      '母貓與小貓溝通'
    ]
  },
  hiss: {
    name: '嘶嘶聲',
    description: '防禦性聲音,表示感到威脅',
    commonMeanings: [
      '警告信號',
      '感到害怕',
      '準備攻擊',
      '要求保持距離'
    ]
  },
  growl: {
    name: '低吼',
    description: '低沉的威脅聲',
    commonMeanings: [
      '憤怒或挫折',
      '領地防衛',
      '警告其他動物',
      '感到威脅'
    ]
  },
  chirp: {
    name: '唧唧聲',
    description: '短促的鳥叫般聲音',
    commonMeanings: [
      '看到鳥或獵物',
      '興奮',
      '友好問候',
      '母貓呼叫小貓'
    ]
  },
  trill: {
    name: '顫音',
    description: '介於喵叫和呼嚕之間的聲音',
    commonMeanings: [
      '友好問候',
      '表達高興',
      '邀請互動',
      '母貓呼叫小貓'
    ]
  },
  yowl: {
    name: '嚎叫',
    description: '拉長的大聲叫聲',
    commonMeanings: [
      '發情期',
      '痛苦或不適',
      '認知障礙 (老年貓)',
      '嚴重壓力'
    ]
  },
  caterwaul: {
    name: '哀嚎',
    description: '激烈的嚎叫,通常與發情有關',
    commonMeanings: [
      '發情期求偶',
      '領地爭奪',
      '極度不適',
      '尋找伴侶'
    ]
  }
}

// 生成使用者友善的摘要
export function generateAudioSummary(analysis: AudioAnalysisResult): string {
  let summary = `🎵 音訊分析結果\n\n`

  // 時長
  summary += `⏱️ 時長: ${analysis.duration.toFixed(1)} 秒\n\n`

  // 情緒和緊急程度
  const emotionEmoji: Record<string, string> = {
    'distressed': '😰',
    'content': '😊',
    'playful': '😸',
    'hungry': '🍽️',
    'attention-seeking': '👋',
    'pain': '😿',
    'normal': '😺'
  }

  const urgencyEmoji: Record<string, string> = {
    'low': '🟢',
    'medium': '🟡',
    'high': '🔴'
  }

  summary += `${emotionEmoji[analysis.emotionalTone] || '😺'} 情緒狀態: ${translateEmotionalTone(analysis.emotionalTone)}\n`
  summary += `${urgencyEmoji[analysis.urgency]} 緊急程度: ${translateUrgency(analysis.urgency)}\n`
  summary += `📊 信心度: ${(analysis.confidence * 100).toFixed(0)}%\n\n`

  // 解釋
  summary += `💡 分析: ${analysis.interpretation}\n`

  // 叫聲類型
  if (analysis.patterns.length > 0) {
    summary += `\n🗣️ 檢測到的叫聲類型:\n`
    for (const pattern of analysis.patterns) {
      const guide = CAT_VOCALIZATION_GUIDE[pattern.type]
      summary += `  • ${guide?.name || pattern.type} (強度: ${(pattern.intensity * 100).toFixed(0)}%)\n`
    }
  }

  // 建議
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    summary += `\n✅ 建議:\n`
    for (const rec of analysis.recommendations) {
      summary += `  • ${rec}\n`
    }
  }

  return summary
}

// 翻譯情緒語調
function translateEmotionalTone(tone: string): string {
  const translations: Record<string, string> = {
    'distressed': '痛苦/不適',
    'content': '滿足/放鬆',
    'playful': '玩耍/興奮',
    'hungry': '飢餓',
    'attention-seeking': '尋求注意',
    'pain': '疼痛',
    'normal': '正常'
  }
  return translations[tone] || tone
}

// 翻譯緊急程度
function translateUrgency(urgency: string): string {
  const translations: Record<string, string> = {
    'low': '低 - 正常狀態',
    'medium': '中 - 建議關注',
    'high': '高 - 需要立即注意'
  }
  return translations[urgency] || urgency
}

// 根據叫聲類型提供建議
export function getRecommendationsByVocalization(type: string): string[] {
  const recommendations: Record<string, string[]> = {
    meow: [
      '回應貓咪的呼叫',
      '檢查食物和水是否充足',
      '花時間與貓咪互動'
    ],
    purr: [
      '繼續撫摸或陪伴',
      '確保貓咪舒適',
      '如果是在不尋常情況下呼嚕,檢查是否有不適'
    ],
    hiss: [
      '給貓咪空間',
      '移除可能的威脅源',
      '避免突然動作',
      '如果持續,考慮諮詢獸醫或行為專家'
    ],
    growl: [
      '保持距離',
      '識別並移除壓力源',
      '給貓咪時間冷靜'
    ],
    chirp: [
      '正常行為,無需擔心',
      '可以和貓咪一起觀察窗外',
      '提供互動玩具'
    ],
    trill: [
      '回應貓咪的友好行為',
      '這是正面信號',
      '可以給予獎勵或互動'
    ],
    yowl: [
      '檢查是否有身體不適',
      '如果未絕育,考慮絕育手術',
      '如果是老年貓,諮詢獸醫檢查認知功能',
      '確保環境沒有壓力源'
    ],
    caterwaul: [
      '考慮絕育手術 (如果未絕育)',
      '提供安靜舒適的環境',
      '如果頻繁出現,諮詢獸醫',
      '檢查是否有其他動物造成壓力'
    ]
  }

  return recommendations[type] || ['觀察貓咪的行為', '如有疑慮請諮詢獸醫']
}
