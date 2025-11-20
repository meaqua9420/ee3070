/**
 * enhancedVision.ts
 *
 * Enhanced Vision Analysis - Beyond Cats
 *
 * 功能扩展：
 * - 不限于猫和家庭环境
 * - 全面安全分析（高风险行为、危险物品、环境隐患）
 * - 实时视频流分析（可选）
 * - 立即警报机制
 */

import type { VisionRiskAnalysis } from './visionRiskAnalyzer'
import { dispatchAlert } from './alertManager'

export interface EnhancedVisionAnalysis {
  // 基础分析
  description: string
  objects: string[]
  scene: string

  // 安全分析
  safetyScore: number // 0-10, 10最安全
  hazards: Hazard[]

  // 行为分析
  detectedBehaviors: string[]
  concerningBehaviors: string[]

  // 建议
  recommendations: string[]
  urgentActions: string[]
}

export interface Hazard {
  type: 'physical' | 'chemical' | 'behavioral' | 'environmental'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  location?: string
  recommendation: string
}

/**
 * 增强的视觉分析System Prompt
 */
export function buildEnhancedVisionPrompt(language: 'zh' | 'en'): string {
  if (language === 'zh') {
    return `你是专业的视觉安全分析AI。分析图片时请关注：

## 🎯 分析重点

### 1. 全面物体识别
- 识别所有可见物体，不限于猫或宠物
- 注意危险物品：化学品、尖锐物、小物件（窒息风险）、电线、热源
- 识别人员、宠物、家具、设备

### 2. 安全隐患检测 ⚠️
扫描以下风险：
- **跌落风险**：开窗、高处、不稳定物品
- **中毒风险**：有毒植物、化学品、药物
- **窒息风险**：小物件、塑料袋、绳索
- **烫伤风险**：热水、炉灶、加热设备
- **电击风险**：裸露电线、插座、损坏电器
- **划伤风险**：玻璃碎片、尖锐物
- **碰撞风险**：不稳定家具、易倒物品

### 3. 行为分析
识别画面中的行为：
- 正常行为：休息、玩耍、进食
- 关注行为：攀爬高处、靠近危险物、异常姿势
- 紧急行为：跌落、受困、接触危险品

### 4. 环境评估
- 光线条件
- 通风状况
- 清洁程度
- 空间布局合理性

## 📊 输出格式（JSON）

{
  "description": "简洁描述图片内容（2-3句）",
  "objects": ["物体1", "物体2", ...],
  "scene": "场景类型（如：客厅、厨房、户外等）",
  "safetyScore": 8,
  "hazards": [
    {
      "type": "physical",
      "severity": "high",
      "description": "开窗且无防护网",
      "location": "窗户",
      "recommendation": "立即安装防护网或关闭窗户"
    }
  ],
  "detectedBehaviors": ["猫咪在窗边", "正在观察外面"],
  "concerningBehaviors": ["靠近开窗"],
  "recommendations": [
    "安装窗户防护网",
    "移除窗边不稳定物品"
  ],
  "urgentActions": [
    "立即关闭无防护的窗户"
  ]
}

## 🚨 紧急情况判定
如果检测到critical severity hazard，必须：
1. safetyScore设为≤3
2. urgentActions中列出立即行动
3. description中明确警告

只输出JSON，不要额外文字。`
  } else {
    return `You are a professional visual safety analysis AI. When analyzing images, focus on:

## 🎯 Analysis Focus

### 1. Comprehensive Object Recognition
- Identify all visible objects, not limited to cats or pets
- Watch for dangerous items: chemicals, sharp objects, small items (choking hazard), wires, heat sources
- Identify people, pets, furniture, equipment

### 2. Safety Hazard Detection ⚠️
Scan for these risks:
- **Fall Risk**: Open windows, heights, unstable items
- **Poisoning Risk**: Toxic plants, chemicals, medications
- **Choking Risk**: Small objects, plastic bags, strings
- **Burn Risk**: Hot water, stoves, heating devices
- **Electric Shock Risk**: Exposed wires, outlets, damaged appliances
- **Cut Risk**: Glass shards, sharp objects
- **Impact Risk**: Unstable furniture, tippable items

### 3. Behavior Analysis
Identify behaviors in the scene:
- Normal: resting, playing, eating
- Concerning: climbing high, approaching hazards, unusual posture
- Emergency: falling, trapped, contact with dangerous items

### 4. Environment Assessment
- Lighting conditions
- Ventilation
- Cleanliness
- Space layout rationality

## 📊 Output Format (JSON)

{
  "description": "Concise image description (2-3 sentences)",
  "objects": ["object1", "object2", ...],
  "scene": "Scene type (e.g., living room, kitchen, outdoor)",
  "safetyScore": 8,
  "hazards": [
    {
      "type": "physical",
      "severity": "high",
      "description": "Open window without safety net",
      "location": "window",
      "recommendation": "Install safety net immediately or close window"
    }
  ],
  "detectedBehaviors": ["cat near window", "observing outside"],
  "concerningBehaviors": ["approaching open window"],
  "recommendations": [
    "Install window safety net",
    "Remove unstable items near window"
  ],
  "urgentActions": [
    "Close unprotected window immediately"
  ]
}

## 🚨 Emergency Determination
If critical severity hazard detected, must:
1. Set safetyScore ≤ 3
2. List immediate actions in urgentActions
3. Clear warning in description

Output JSON only, no extra text.`
  }
}

/**
 * 分析图片（增强版）
 */
export async function analyzeEnhancedVision(
  imageData: { imageBase64?: string; imageUrl?: string; mimeType?: string },
  visionConfig: any,
  language: 'zh' | 'en' = 'zh'
): Promise<EnhancedVisionAnalysis> {
  const prompt = buildEnhancedVisionPrompt(language)

  // 调用视觉模型API
  const payload: any = {
    model: visionConfig.serverModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_tokens: visionConfig.maxTokens,
    temperature: visionConfig.temperature,
  }

  // 添加图片
  if (imageData.imageBase64) {
    payload.messages[0].content.push({
      type: 'image_url',
      image_url: {
        url: imageData.imageBase64,
      },
    })
  } else if (imageData.imageUrl) {
    payload.messages[0].content.push({
      type: 'image_url',
      image_url: {
        url: imageData.imageUrl,
      },
    })
  }

  const response = await fetch(visionConfig.serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(visionConfig.apiKey ? { Authorization: `Bearer ${visionConfig.apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(visionConfig.timeoutMs || 60000),
  })

  if (!response.ok) {
    throw new Error(`Vision API failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }
  const rawOutput = data.choices?.[0]?.message?.content || ''

  // 解析JSON输出
  try {
    // 提取JSON（可能被markdown代码块包裹）
    let jsonStr = rawOutput
    const match = rawOutput.match(/```json\s*(\{[\s\S]*?\})\s*```/)
    if (match?.[1]) {
      jsonStr = match[1]
    }

    const analysis = JSON.parse(jsonStr) as EnhancedVisionAnalysis

    // 自动触发紧急警报
    if (analysis.urgentActions && analysis.urgentActions.length > 0) {
      await triggerUrgentAlert(analysis, language)
    }

    return analysis
  } catch (e) {
    console.error('[enhanced-vision] Failed to parse JSON:', e)
    // Fallback: 创建基础分析
    return {
      description: rawOutput.substring(0, 200),
      objects: [],
      scene: 'unknown',
      safetyScore: 5,
      hazards: [],
      detectedBehaviors: [],
      concerningBehaviors: [],
      recommendations: [],
      urgentActions: [],
    }
  }
}

/**
 * 触发紧急警报
 */
async function triggerUrgentAlert(
  analysis: EnhancedVisionAnalysis,
  language: 'zh' | 'en'
): Promise<void> {
  const criticalHazards = analysis.hazards.filter(h => h.severity === 'critical')
  const highHazards = analysis.hazards.filter(h => h.severity === 'high')

  if (criticalHazards.length === 0 && highHazards.length === 0) {
    return
  }

  const alertMessage = language === 'zh'
    ? `🚨 视觉安全警报\n\n${analysis.description}\n\n紧急行动：\n${analysis.urgentActions.map(a => `• ${a}`).join('\n')}`
    : `🚨 Visual Safety Alert\n\n${analysis.description}\n\nUrgent Actions:\n${analysis.urgentActions.map(a => `• ${a}`).join('\n')}`

  await dispatchAlert(
    alertMessage,
    'critical',
    {
      messageKey: 'visionSafetyAlert',
      audioAlert: true,
      showBanner: true,
      autoTask: {
        category: 'safety',
        priority: 'high',
        dueInHours: 0.5, // 30分钟内处理
      },
    }
  )

  console.error('[enhanced-vision] 🚨 URGENT ALERT TRIGGERED:', {
    criticalCount: criticalHazards.length,
    highCount: highHazards.length,
    urgentActions: analysis.urgentActions,
  })
}

/**
 * 批量分析视频帧（实时流分析）
 */
export async function analyzeVideoStream(
  frameGenerator: AsyncGenerator<{ imageBase64: string; timestamp: number }>,
  visionConfig: any,
  language: 'zh' | 'en',
  options: {
    analyzeInterval?: number // 分析间隔（毫秒），默认5000
    onAnalysis?: (analysis: EnhancedVisionAnalysis, frame: number) => void
    onUrgentDetection?: (analysis: EnhancedVisionAnalysis) => void
  } = {}
): Promise<void> {
  const { analyzeInterval = 5000, onAnalysis, onUrgentDetection } = options

  let frameCount = 0
  let lastAnalysisTime = 0

  for await (const frame of frameGenerator) {
    frameCount++
    const now = Date.now()

    // 控制分析频率
    if (now - lastAnalysisTime < analyzeInterval) {
      continue
    }

    lastAnalysisTime = now

    try {
      const analysis = await analyzeEnhancedVision(
        { imageBase64: frame.imageBase64, mimeType: 'image/jpeg' },
        visionConfig,
        language
      )

      onAnalysis?.(analysis, frameCount)

      // 检测紧急情况
      if (analysis.urgentActions.length > 0) {
        onUrgentDetection?.(analysis)
      }
    } catch (error) {
      console.error(`[video-stream] Frame ${frameCount} analysis failed:`, error)
    }
  }
}
