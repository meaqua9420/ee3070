import { AsyncLocalStorage } from 'node:async_hooks'
import type { LanguageCode } from '../types'
import { loadLanguage, saveLanguage } from '../db'
import { logger } from '../logger'

const languageContext = new AsyncLocalStorage<LanguageCode>()
let persistedLanguage: LanguageCode = loadLanguage()

export function getPreferredLanguage(): LanguageCode {
  return languageContext.getStore() ?? persistedLanguage
}

export function runWithLanguageContext<T>(language: LanguageCode, fn: () => Promise<T>): Promise<T> {
  return languageContext.run(language, fn)
}

export function resolveRequestLanguage(rawLanguage: unknown): LanguageCode {
  return rawLanguage === 'zh' || rawLanguage === 'en' ? rawLanguage : getPreferredLanguage()
}

export function setPersistedLanguage(language: LanguageCode): void {
  if (persistedLanguage === language) return
  persistedLanguage = language
  try {
    saveLanguage(language)
  } catch (error) {
    logger.warn('[language] Failed to persist preferred language', { error })
  }
}
