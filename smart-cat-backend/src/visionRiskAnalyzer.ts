/**
 * 視覺風險分析器
 * 分析貓咪照片的安全風險，評分0-10
 */

/**
 * 風險等級
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 風險類別
 */
export type RiskCategory =
  | 'injury'           // 受傷
  | 'illness'          // 疾病症狀
  | 'environmental'    // 環境危險
  | 'behavior'         // 異常行為
  | 'equipment'        // 設備故障
  | 'unknown';         // 未知

/**
 * 風險分析結果
 */
export interface VisionRiskAnalysis {
  score: number;                    // 風險評分 0-10
  level: RiskLevel;                 // 風險等級
  category: RiskCategory;           // 風險類別
  description: string;              // 風險描述
  confidence: number;               // 信心值 0-1
  recommendations: string[];        // 建議行動
  urgency: 'low' | 'medium' | 'high' | 'immediate';  // 緊急程度
  detectedIssues: Array<{
    type: string;
    severity: number;
    location?: string;
  }>;
}

/**
 * 風險關鍵詞配置
 */
const RISK_KEYWORDS = {
  critical: {
    injury: ['bleeding', '流血', 'injured', '受傷', 'wound', '傷口', 'limping', '跛行'],
    illness: ['vomiting', '嘔吐', 'diarrhea', '腹瀉', 'seizure', '抽搐', 'collapse', '倒地'],
    environmental: ['fire', '火', 'smoke', '煙', 'flood', '水患', 'toxic', '有毒'],
  },
  high: {
    injury: ['scratched', '抓傷', 'bite', '咬傷', 'swollen', '腫脹', 'limping', '跛行'],
    illness: ['lethargic', '無精打采', 'difficulty breathing', '呼吸困難', 'pale gums', '牙齦蒼白'],
    environmental: ['sharp objects', '尖銳物', 'electrical', '電器', 'chemicals', '化學品', 'toxic plants', '有毒植物'],
    behavior: ['aggressive', '攻擊性', 'panic', '恐慌', 'hiding', '躲藏', 'excessive grooming', '過度舔毛'],
  },
  medium: {
    illness: ['sneezing', '打噴嚏', 'coughing', '咳嗽', 'discharge', '分泌物', 'loss of appetite', '食慾不振'],
    environmental: ['messy', '凌亂', 'dirty litter', '貓砂髒', 'water spill', '水灑'],
    behavior: ['restless', '不安', 'excessive meowing', '過度叫喚', 'pacing', '踱步'],
    equipment: ['feeder empty', '餵食器空了', 'water low', '水位低', 'litter full', '貓砂滿了'],
  },
  low: {
    behavior: ['playing', '玩耍', 'sleeping', '睡覺', 'grooming', '理毛', 'relaxed', '放鬆'],
    environmental: ['normal', '正常', 'clean', '乾淨', 'comfortable', '舒適'],
  },
};

/**
 * 計算風險評分
 */
function calculateRiskScore(
  description: string,
  detectedIssues: Array<{ type: string; severity: number }>
): { score: number; level: RiskLevel; category: RiskCategory } {
  const lowerDesc = description.toLowerCase();
  let score = 0;
  let primaryCategory: RiskCategory = 'unknown';
  let maxSeverity = 0;

  // 檢查關鍵詞
  for (const [severity, categories] of Object.entries(RISK_KEYWORDS)) {
    for (const [category, keywords] of Object.entries(categories)) {
      const matchCount = keywords.filter(keyword =>
        lowerDesc.includes(keyword.toLowerCase())
      ).length;

      if (matchCount > 0) {
        const severityScore =
          severity === 'critical' ? 9 :
          severity === 'high' ? 7 :
          severity === 'medium' ? 4 :
          2;

        if (severityScore > maxSeverity) {
          maxSeverity = severityScore;
          primaryCategory = category as RiskCategory;
        }

        score = Math.max(score, severityScore);
      }
    }
  }

  // 根據檢測到的問題調整分數
  for (const issue of detectedIssues) {
    score = Math.max(score, issue.severity);
  }

  // 確保分數在0-10範圍內
  score = Math.min(10, Math.max(0, score));

  // 確定風險等級
  let level: RiskLevel;
  if (score >= 8) {
    level = 'critical';
  } else if (score >= 6) {
    level = 'high';
  } else if (score >= 3) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { score, level, category: primaryCategory };
}

/**
 * 生成建議
 */
function generateRecommendations(
  level: RiskLevel,
  category: RiskCategory,
  description: string
): string[] {
  const recommendations: string[] = [];

  if (level === 'critical') {
    recommendations.push('🚨 立即檢查貓咪狀況！');
    if (category === 'injury' || category === 'illness') {
      recommendations.push('📞 考慮聯繫獸醫');
    }
    recommendations.push('📸 拍攝更多照片記錄');
  }

  if (level === 'high') {
    recommendations.push('⚠️ 儘快查看貓咪');
    if (category === 'environmental') {
      recommendations.push('🧹 移除潛在危險物品');
    }
    if (category === 'behavior') {
      recommendations.push('🎯 觀察行為變化');
    }
  }

  if (level === 'medium') {
    recommendations.push('👀 持續觀察');
    if (category === 'equipment') {
      recommendations.push('🔧 檢查並維護設備');
    }
  }

  if (category === 'illness') {
    recommendations.push('📝 記錄症狀持續時間');
  }

  if (category === 'environmental') {
    recommendations.push('🏠 確保環境安全整潔');
  }

  return recommendations;
}

/**
 * 確定緊急程度
 */
function determineUrgency(score: number, level: RiskLevel): 'low' | 'medium' | 'high' | 'immediate' {
  if (score >= 9) return 'immediate';
  if (level === 'critical') return 'immediate';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

/**
 * 分析視覺描述並評估風險
 */
export function analyzeVisionRisk(
  visionDescription: string,
  confidence: number = 0.8
): VisionRiskAnalysis {
  // 初始檢測到的問題
  const detectedIssues: Array<{ type: string; severity: number; location?: string }> = [];

  // 簡單的問題檢測邏輯（可以後續擴展為ML模型）
  const lowerDesc = visionDescription.toLowerCase();

  // 檢測受傷
  if (lowerDesc.includes('blood') || lowerDesc.includes('流血')) {
    detectedIssues.push({ type: 'bleeding', severity: 9 });
  }

  // 檢測異常姿勢
  if (lowerDesc.includes('lying down') && lowerDesc.includes('not moving')) {
    detectedIssues.push({ type: 'immobile', severity: 7 });
  }

  // 檢測環境危險
  if (lowerDesc.includes('sharp') || lowerDesc.includes('尖銳')) {
    detectedIssues.push({ type: 'sharp_object', severity: 6 });
  }

  // 計算風險評分
  const { score, level, category } = calculateRiskScore(visionDescription, detectedIssues);

  // 生成建議
  const recommendations = generateRecommendations(level, category, visionDescription);

  // 確定緊急程度
  const urgency = determineUrgency(score, level);

  return {
    score,
    level,
    category,
    description: visionDescription,
    confidence,
    recommendations,
    urgency,
    detectedIssues,
  };
}

/**
 * 檢查是否需要觸發警報
 */
export function shouldTriggerAlert(analysis: VisionRiskAnalysis): boolean {
  return analysis.score >= 7 || analysis.urgency === 'immediate';
}

/**
 * 格式化風險報告（用於顯示）
 */
export function formatRiskReport(analysis: VisionRiskAnalysis, language: 'zh' | 'en' = 'zh'): string {
  const levelEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  const levelText = {
    zh: {
      critical: '危急',
      high: '高風險',
      medium: '中等',
      low: '低風險',
    },
    en: {
      critical: 'Critical',
      high: 'High Risk',
      medium: 'Medium',
      low: 'Low Risk',
    },
  };

  const urgencyText = {
    zh: {
      immediate: '立即處理',
      high: '儘快處理',
      medium: '注意觀察',
      low: '正常',
    },
    en: {
      immediate: 'Immediate Action',
      high: 'Prompt Action',
      medium: 'Monitor',
      low: 'Normal',
    },
  };

  const header = language === 'zh'
    ? `${levelEmoji[analysis.level]} 風險等級：${levelText.zh[analysis.level]} (${analysis.score}/10)`
    : `${levelEmoji[analysis.level]} Risk Level: ${levelText.en[analysis.level]} (${analysis.score}/10)`;

  const urgency = language === 'zh'
    ? `緊急程度：${urgencyText.zh[analysis.urgency]}`
    : `Urgency: ${urgencyText.en[analysis.urgency]}`;

  const recommendations = analysis.recommendations.join('\n');

  return `${header}\n${urgency}\n\n${analysis.description}\n\n${recommendations}`;
}
