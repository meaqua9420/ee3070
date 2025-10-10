import { createContext, useContext, useMemo, useState, useEffect } from 'react'
import {
  type Language,
  type TranslationKey,
  supportedLanguages,
  languageOptions,
  translate,
} from './translations'
import { syncServiceWorkerLanguage } from '../utils/pushNotifications'
import { saveLanguagePreference } from '../utils/backendClient'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string
  options: typeof languageOptions
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)
const STORAGE_KEY = 'smartCatHome.language'

function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'zh'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null
  if (stored && supportedLanguages.includes(stored)) {
    return stored
  }

  const navigatorLang = window.navigator.language?.toLowerCase() ?? ''
  if (navigatorLang.startsWith('en')) {
    return 'en'
  }

  return 'zh'
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => resolveInitialLanguage())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, variables) => translate(language, key, variables),
      options: languageOptions,
    }),
    [language],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    syncServiceWorkerLanguage(language).catch((error) => {
      console.warn('[i18n] Failed to sync service worker language', error)
    })
    saveLanguagePreference(language).catch((error) => {
      console.warn('[i18n] Failed to persist language preference', error)
    })
  }, [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
