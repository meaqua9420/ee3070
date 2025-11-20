import type { KnowledgeArticle, LanguageCode } from './types'

interface ScoredArticle extends KnowledgeArticle {
  score: number
}

const ARTICLES: KnowledgeArticle[] = [
  {
    id: 'hydration-basics',
    locale: 'any',
    tags: ['hydration', 'daily-care'],
    title: '保持喝水習慣 / Hydration Basics',
    summary:
      '協助貓咪維持穩定飲水量，從水碗布置、風味變化到互動引導的實用技巧。',
    body: [
      '確保室溫或微溫的水每天至少換兩次，水碗位置保持寧靜、避免靠近廁所或食盆太近造成立即混味。',
      '提供至少兩個不同材質與高度的水盆；部分貓咪偏好流動水，可考慮使用循環活水機。',
      '遊戲或梳理後立即把水碗靠近，耐心停留 30 秒鼓勵牠聞水面，可加入少量低鹽雞湯提升風味。',
      '觀察一週飲水趨勢，如低於體重 (kg) × 50 ml，建議諮詢獸醫或調整食譜含水量。',
    ].join('\n'),
    sources: ['Indoor Cat Care Guide 2024', 'Feline Hydration Whitepaper, Pet Wellness Lab'],
    updatedAt: '2025-02-01T09:00:00.000Z',
  },
  {
    id: 'play-therapy',
    locale: 'any',
    tags: ['behavior', 'anxiety'],
    title: '互動遊戲舒緩壓力 / Play Therapy',
    summary: '透過規律逗玩協助貓咪釋放壓力、建立安全感與正向連結。',
    body: [
      '規劃三階段逗玩法：「追獵」(逗貓棒高速移動) → 「捕捉」(讓貓咪成功抓到) → 「餵食」(提供小點心)。',
      '每日 2–3 次，每次 5–10 分鐘即可，保持低壓力緩慢收尾，並在最後加上撫摸或口頭肯定。',
      '注意室內照明與氣味，避免強光直射或噪音干擾，營造安心的活動空間。',
      '若貓咪長期不主動玩耍，可能與疼痛或焦慮相關，建議安排健康檢查。',
    ].join('\n'),
    sources: ['Cat Enrichment Symposium 2023', 'Fear Free Certified Professionals'],
    updatedAt: '2025-01-12T10:22:00.000Z',
  },
  {
    id: 'litter-maintenance',
    locale: 'any',
    tags: ['maintenance', 'hygiene'],
    title: '貓砂盆維護節奏 / Litter Box Rhythm',
    summary: '打造舒適的如廁環境，預防拒絕使用或異味堆積。',
    body: [
      '至少每日早晚各清一次，並保持盆邊乾燥，可備份一個盆交替使用。',
      '砂層高度約 5–7 cm，定期補砂避免露底；一個貓咪至少兩個砂盆，位置分置在不同房間。',
      '每 2–4 週全面更換砂並清洗盆體，使用無香洗劑後徹底烘乾，防止殘留氣味。',
      '觀察排便型態，如出現結塊極少或尿量驟減，需留意泌尿或腸胃問題並紀錄供獸醫參考。',
    ].join('\n'),
    sources: ['AAFP Environmental Needs Guidelines', 'Feline Hygienic Study 2022'],
    updatedAt: '2024-12-01T08:10:00.000Z',
  },
  {
    id: 'grooming-routine',
    locale: 'any',
    tags: ['wellness', 'daily-care'],
    title: '梳理與毛髮管理 / Grooming Routine',
    summary: '建立規律梳理，降低毛球與皮膚問題的風險。',
    body: [
      '短毛貓每週 3 次、長毛貓每日梳理，先用排梳理出結塊，再用軟毛刷拋光。',
      '檢查皮屑、紅腫或蟲咬痕跡，一旦發現需拍照記錄並安排獸醫檢查。',
      '梳理後提供正向強化，如零食或撫摸，讓貓咪將梳毛與愉快體驗連結。',
      '換季期間增加空氣濕度與吸塵頻率，保持環境整潔，減少掉毛堆積。',
    ].join('\n'),
    sources: ['Pet Dermatology Journal 2024', 'Feline Husbandry Manual'],
    updatedAt: '2025-02-07T07:45:00.000Z',
  },
  {
    id: 'weight-management',
    locale: 'any',
    tags: ['nutrition', 'health'],
    title: '體重管理與飲食調整 / Weight Management',
    summary: '判斷體重趨勢並設計逐步調整的飲食策略。',
    body: [
      '以 BCS (Body Condition Score) 4–5 為目標，定期摸背部肋骨與腰線確認是否輕易摸到。',
      '體重每週記錄一次，如單月增減超過 10%，建議諮詢獸醫排除內分泌或代謝異常。',
      '減重時每週熱量調整不超過 5%，分成 3–4 餐餵食並增加逗玩時間，避免飢餓導致脂肪肝。',
      '增重則提升高蛋白濕食比例，並維持固定用餐時間，避免過量零食。',
    ].join('\n'),
    sources: ['WSAVA Global Nutrition Toolkit', 'Feline Metabolism Insights 2023'],
    updatedAt: '2025-01-28T13:30:00.000Z',
  },
]

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeScore(article: KnowledgeArticle, queryTokens: string[]): number {
  const haystack = normalise(`${article.title} ${article.summary} ${article.body} ${article.tags.join(' ')}`)
  let score = 0
  for (const token of queryTokens) {
    if (!token) continue
    if (haystack.includes(token)) score += 1
  }
  if (score === 0) {
    // 基礎獎勵：同標籤或同語系仍給微量分數
    score = 0.2
  }
  return score
}

export function retrieveKnowledgeArticles(
  language: LanguageCode,
  query: string,
  limit = 5,
  tags: string[] = [],
): KnowledgeArticle[] {
  const tokens = normalise(query).split(' ').filter(Boolean)
  const scored: ScoredArticle[] = []

  for (const article of ARTICLES) {
    if (article.locale !== 'any' && article.locale !== language) continue
    if (tags.length && !tags.some((tag) => article.tags.includes(tag))) continue
    const score = computeScore(article, tokens)
    if (score <= 0) continue
    scored.push({ ...article, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(({ score: _score, ...article }) => article)
}

export function buildKnowledgePrompt(language: LanguageCode, query: string): string {
  const articles = retrieveKnowledgeArticles(language, query, 3)
  if (!articles.length) return ''

  const header =
    language === 'zh'
      ? '以下為與貓咪照護相關的資料摘錄，可作為回答參考：'
      : 'Relevant feline care references you can draw from:'

  const lines = articles.map((article, index) => {
    const prefix = `${index + 1}. ${article.title}:`
    return `${prefix} ${article.summary}`
  })

  return [header, ...lines].join('\n')
}

export function listKnowledgeArticles(language: LanguageCode): KnowledgeArticle[] {
  return ARTICLES.filter((article) => article.locale === 'any' || article.locale === language)
}
