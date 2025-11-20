// 影片處理模組 - 行為分析
import { readFile } from './fileHandler.js'

export interface VideoAnalysisResult {
  duration: number  // 秒
  frameCount: number
  fps: number
  keyFrames: Array<{
    timestamp: number  // 秒
    imageUrl: string  // Base64 或 URL
    analysis: string
  }>
  behaviorSummary: string
  activities: Array<{
    type: 'playing' | 'eating' | 'sleeping' | 'grooming' | 'exploring' | 'scratching' | 'litter_box' | 'drinking' | 'hunting' | 'resting'
    startTime: number  // 秒
    endTime: number    // 秒
    confidence: number // 0-1
    description?: string
  }>
  abnormalBehaviors?: Array<{
    type: string
    timestamp: number
    description: string
    severity: 'low' | 'medium' | 'high'
  }>
  healthObservations?: string[]
  recommendations?: string[]
}

// 基於啟發式的簡易影片分析
// 注意: 完整實現需要 ffmpeg 和機器學習模型
export async function analyzeVideoHeuristic(fileId: string): Promise<VideoAnalysisResult> {
  try {
    const buffer = await readFile(fileId)

    // 估算影片長度 (基於檔案大小)
    // 假設 720p 視頻 ~5Mbps: 1 秒 ≈ 625KB
    const estimatedDuration = Math.max(1, buffer.length / (625 * 1024))

    const analysis: VideoAnalysisResult = {
      duration: estimatedDuration,
      frameCount: Math.floor(estimatedDuration * 30), // 假設 30fps
      fps: 30,
      keyFrames: [],
      behaviorSummary: '影片已接收。完整分析需要描述影片內容或使用進階視覺模型。',
      activities: []
    }

    return analysis
  } catch (error) {
    console.error('Video analysis error:', error)
    throw new Error('Failed to analyze video file')
  }
}

// 使用 AI 分析影片描述
export async function analyzeVideoWithAI(
  fileId: string,
  userDescription: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<VideoAnalysisResult> {
  // 基本分析
  const basicAnalysis = await analyzeVideoHeuristic(fileId)

  // 如果使用者提供描述,使用 AI 分析
  if (userDescription) {
    const prompt = `作為貓咪行為專家,請分析以下影片描述,並以 JSON 格式回覆:

影片描述: ${userDescription}

請識別:
1. 主要行為活動 (activities): 陣列,包含:
   - type: playing, eating, sleeping, grooming, exploring, scratching, litter_box, drinking, hunting, resting
   - description: 行為描述
   - confidence: 0-1

2. 行為摘要 (behaviorSummary): 2-3 句話總結

3. 異常行為 (abnormalBehaviors): 如果有的話
   - type: 異常類型
   - description: 描述
   - severity: low, medium, high

4. 健康觀察 (healthObservations): 從影片中觀察到的健康相關資訊

5. 建議 (recommendations): 給飼主的建議

回覆格式:
{
  "behaviorSummary": "摘要文字",
  "activities": [
    {"type": "playing", "description": "描述", "confidence": 0.9}
  ],
  "abnormalBehaviors": [
    {"type": "excessive_grooming", "description": "描述", "severity": "medium"}
  ],
  "healthObservations": ["觀察1", "觀察2"],
  "recommendations": ["建議1", "建議2"]
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

      // 合併結果
      const enhancedAnalysis: VideoAnalysisResult = {
        ...basicAnalysis,
        behaviorSummary: parsed.behaviorSummary || basicAnalysis.behaviorSummary,
        abnormalBehaviors: parsed.abnormalBehaviors,
        healthObservations: parsed.healthObservations,
        recommendations: parsed.recommendations
      }

      // 處理活動
      if (parsed.activities && Array.isArray(parsed.activities)) {
        enhancedAnalysis.activities = parsed.activities.map((act: any, index: number) => ({
          type: act.type || 'resting',
          startTime: index * 5, // 簡化: 每個活動 5 秒
          endTime: (index + 1) * 5,
          confidence: act.confidence || 0.7,
          description: act.description
        }))
      }

      return enhancedAnalysis
    } catch (error) {
      console.error('AI video analysis error:', error)
      return basicAnalysis
    }
  }

  return basicAnalysis
}

// 貓咪行為類型說明
export const CAT_BEHAVIOR_GUIDE: Record<string, {
  name: string
  description: string
  normalDuration: string
  concernSigns: string[]
}> = {
  playing: {
    name: '玩耍',
    description: '貓咪進行遊戲活動,追逐玩具或模擬狩獵',
    normalDuration: '每天 15-30 分鐘',
    concernSigns: [
      '完全不玩耍 (可能表示生病或沮喪)',
      '過度激烈的玩耍導致攻擊',
      '深夜過度玩耍 (可能是精力過剩)'
    ]
  },
  eating: {
    name: '進食',
    description: '貓咪正在吃飯',
    normalDuration: '每餐 5-15 分鐘',
    concernSigns: [
      '進食速度過快 (可能導致嘔吐)',
      '進食過慢或挑食',
      '食量突然改變',
      '進食時疼痛表現'
    ]
  },
  sleeping: {
    name: '睡覺',
    description: '貓咪在休息或睡眠',
    normalDuration: '每天 12-16 小時',
    concernSigns: [
      '睡眠時間突然大幅增加或減少',
      '睡眠時呼吸困難',
      '不願移動到舒適位置',
      '睡眠中頻繁醒來'
    ]
  },
  grooming: {
    name: '理毛',
    description: '貓咪清潔自己',
    normalDuration: '每天 30-50% 清醒時間',
    concernSigns: [
      '過度理毛導致脫毛',
      '完全停止理毛',
      '只理某個特定部位',
      '理毛時表現痛苦'
    ]
  },
  exploring: {
    name: '探索',
    description: '貓咪探索環境',
    normalDuration: '視情況而定',
    concernSigns: [
      '突然對熟悉環境感到陌生',
      '完全不探索新事物',
      '過度焦慮的探索行為',
      '撞到物體 (可能視力問題)'
    ]
  },
  scratching: {
    name: '抓磨',
    description: '貓咪抓磨爪子',
    normalDuration: '每天數次',
    concernSigns: [
      '過度抓磨導致爪子受傷',
      '在不尋常的地方抓磨 (可能是焦慮)',
      '抓磨時表現痛苦',
      '完全停止抓磨'
    ]
  },
  litter_box: {
    name: '如廁',
    description: '貓咪使用貓砂盆',
    normalDuration: '每次 1-3 分鐘',
    concernSigns: [
      '在貓砂盆外如廁',
      '如廁時間過長',
      '如廁時發出叫聲',
      '頻繁進出貓砂盆但沒有排泄',
      '如廁姿勢異常'
    ]
  },
  drinking: {
    name: '飲水',
    description: '貓咪在喝水',
    normalDuration: '每天多次,每次少量',
    concernSigns: [
      '飲水量突然大幅增加 (可能是糖尿病或腎病)',
      '完全不喝水',
      '飲水困難或咳嗽',
      '只喝流動的水'
    ]
  },
  hunting: {
    name: '狩獵',
    description: '貓咪展現狩獵行為',
    normalDuration: '視情況而定',
    concernSigns: [
      '對獵物完全無興趣 (老年貓可能正常)',
      '狩獵行為過度攻擊性',
      '無法成功捕捉 (可能視力或協調問題)'
    ]
  },
  resting: {
    name: '休息',
    description: '貓咪清醒但放鬆休息',
    normalDuration: '每天數小時',
    concernSigns: [
      '休息時呼吸異常',
      '無法找到舒適姿勢',
      '休息時不斷改變位置',
      '警戒性過高無法放鬆'
    ]
  }
}

// 生成使用者友善的摘要
export function generateVideoSummary(analysis: VideoAnalysisResult): string {
  let summary = `🎬 影片分析結果\n\n`

  // 基本資訊
  summary += `⏱️ 時長: ${analysis.duration.toFixed(1)} 秒\n`
  summary += `🎞️ 幀數: ${analysis.frameCount} 幀 (${analysis.fps} fps)\n\n`

  // 行為摘要
  summary += `📝 行為摘要:\n${analysis.behaviorSummary}\n\n`

  // 識別的活動
  if (analysis.activities.length > 0) {
    summary += `🎭 識別的行為:\n`
    for (const activity of analysis.activities) {
      const guide = CAT_BEHAVIOR_GUIDE[activity.type]
      const emoji = getActivityEmoji(activity.type)
      summary += `  ${emoji} ${guide?.name || activity.type}`

      if (activity.description) {
        summary += `: ${activity.description}`
      }

      summary += ` (信心度: ${(activity.confidence * 100).toFixed(0)}%)\n`
    }
    summary += '\n'
  }

  // 異常行為
  if (analysis.abnormalBehaviors && analysis.abnormalBehaviors.length > 0) {
    summary += `⚠️ 異常行為:\n`
    for (const behavior of analysis.abnormalBehaviors) {
      const severityEmoji = {
        low: '🟡',
        medium: '🟠',
        high: '🔴'
      }
      summary += `  ${severityEmoji[behavior.severity]} ${behavior.description}\n`
    }
    summary += '\n'
  }

  // 健康觀察
  if (analysis.healthObservations && analysis.healthObservations.length > 0) {
    summary += `🏥 健康觀察:\n`
    for (const observation of analysis.healthObservations) {
      summary += `  • ${observation}\n`
    }
    summary += '\n'
  }

  // 建議
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    summary += `✅ 建議:\n`
    for (const rec of analysis.recommendations) {
      summary += `  • ${rec}\n`
    }
  }

  return summary
}

// 獲取行為對應的 Emoji
function getActivityEmoji(type: string): string {
  const emojis: Record<string, string> = {
    playing: '🎾',
    eating: '🍽️',
    sleeping: '😴',
    grooming: '🧼',
    exploring: '🔍',
    scratching: '🪵',
    litter_box: '🚽',
    drinking: '💧',
    hunting: '🎯',
    resting: '😌'
  }
  return emojis[type] || '🐱'
}

// 檢測異常行為模式
export function detectAbnormalPatterns(activities: VideoAnalysisResult['activities']): Array<{
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
}> {
  const abnormal: Array<{
    type: string
    description: string
    severity: 'low' | 'medium' | 'high'
  }> = []

  // 統計行為持續時間
  const activityDurations: Record<string, number> = {}
  for (const activity of activities) {
    const duration = activity.endTime - activity.startTime
    activityDurations[activity.type] = (activityDurations[activity.type] || 0) + duration
  }

  // 檢測過度理毛
  if (activityDurations.grooming && activityDurations.grooming > 300) { // 5 分鐘
    abnormal.push({
      type: 'excessive_grooming',
      description: '過度理毛行為,可能表示焦慮或皮膚問題',
      severity: 'medium'
    })
  }

  // 檢測過度抓磨
  if (activityDurations.scratching && activityDurations.scratching > 180) { // 3 分鐘
    abnormal.push({
      type: 'excessive_scratching',
      description: '過度抓磨,可能是焦慮、無聊或爪子問題',
      severity: 'medium'
    })
  }

  // 檢測長時間在貓砂盆
  if (activityDurations.litter_box && activityDurations.litter_box > 180) { // 3 分鐘
    abnormal.push({
      type: 'litter_box_difficulty',
      description: '在貓砂盆停留時間過長,可能有排泄困難',
      severity: 'high'
    })
  }

  return abnormal
}

// 生成健康觀察
export function generateHealthObservations(activities: VideoAnalysisResult['activities']): string[] {
  const observations: string[] = []

  // 統計活動類型
  const activityTypes = new Set(activities.map(a => a.type))

  // 正面觀察
  if (activityTypes.has('playing')) {
    observations.push('貓咪有玩耍行為,表示精力充沛')
  }

  if (activityTypes.has('grooming')) {
    observations.push('貓咪有自我清潔行為,通常是健康的標誌')
  }

  if (activityTypes.has('eating')) {
    observations.push('貓咪有進食行為,食慾正常')
  }

  // 如果沒有任何活動
  if (activities.length === 0 || (activities.length === 1 && activities[0].type === 'sleeping')) {
    observations.push('影片中主要是休息/睡眠,如果這是貓咪的正常作息時間則無需擔心')
  }

  return observations
}
