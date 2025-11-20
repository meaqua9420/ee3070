import type { LanguageCode } from './types'

export type CatPolicyViolation = 'prompt_injection' | 'non_cat'

export interface CatPolicyDecision {
  reason: CatPolicyViolation
  message: string
}

const OTHER_ANIMAL_KEYWORDS: readonly RegExp[] = [
  /\bdog(s|go)?\b/i,
  /\bpupp(?:y|ies)\b/i,
  /\bcanine\b/i,
  /\bcachorr(?:o|os|inha|inhas)\b/i,
  /\bc[aã]o(?:s)?\b/i,
  /\bchien(s)?\b/i,
  /\bhamster(s)?\b/i,
  /\bparrot(s)?\b/i,
  /\brabbit(s)?\b/i,
  /\bbird(s)?\b/i,
  /\breptile(s)?\b/i,
  /\bfish\b/i,
  /\bpet\b(?!.*cat)/i,
  /\b動物\b/,
  /狗/,
  /犬/,
  /小狗/,
  /小犬/,
  /汪/,
  /鳥/,
  /兔/,
  /狗狗/,
  /倉鼠/,
  /寵物狗/,
  /其他動物/,
  /其它動物/,
  /犬類/,
  /わんこ/,
  /イヌ/,
  /犬ちゃん/,
  /ペット(?!.*猫)/,
  /강아지/,
  /반려견/,
  /\bperro(s)?\b/i,
  /\bmascota(s)?\b/i,
  /\bperr[oa]\b/i,
  /\bcachorro(s)?\b/i,
  /\bhund(e)?\b/i,
] as const

const CAT_KEYWORDS: readonly RegExp[] = [
  /\bcat(s)?\b/i,
  /\bfeline(s)?\b/i,
  /\bkitty\b/i,
  /\bkitten(s)?\b/i,
  /貓/,
  /猫/,
  /貓咪/,
  /喵/,
] as const

export function buildPolicyMessage(reason: CatPolicyViolation, language: LanguageCode): string {
  if (reason === 'prompt_injection') {
    return language === 'en'
      ? 'Smart Cat Home only follows its built‑in safety rules for supporting cat care. I can’t ignore those instructions or adopt a different role.'
      : 'Smart Cat Home 僅遵循內建的安全規則來協助照顧貓咪，我無法忽略這些指引或扮演其它角色。'
  }
  return language === 'en'
    ? 'Smart Cat Home can only discuss cats and their wellbeing. I can’t help with dogs or other animals—please rephrase your question for your cat.'
    : 'Smart Cat Home 只針對貓咪與其照護提供協助，無法討論狗或其他動物，請將問題改成與貓咪相關喔。'
}

function containsPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

export function enforceCatOnlyAnswer(
  input: string | null | undefined,
  language: LanguageCode,
): CatPolicyDecision | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const lowered = trimmed.toLowerCase()

  if (containsPattern(trimmed, OTHER_ANIMAL_KEYWORDS)) {
    return {
      reason: 'non_cat',
      message: buildPolicyMessage('non_cat', language),
    }
  }

  return null
}
