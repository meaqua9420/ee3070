# i18n Language Bugs - Before & After Examples

## Quick Visual Guide to Problems and Solutions

---

## BUG #1: ErrorBoundary - Bilingual Text

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/ErrorBoundary.tsx

render() {
  if (this.state.hasError) {
    return (
      <div>
        <h1 style={{ color: '#dc3545' }}>
          ⚠️ 應用程式發生錯誤 / Application Error
        </h1>
        <p>抱歉，應用程式遇到了問題。請嘗試重新整理頁面。</p>
        <p>Sorry, the application encountered a problem. Please try refreshing the page.</p>
        <details>
          <summary>技術細節 / Technical Details</summary>
          {/* ... */}
        </details>
        <button>重試 / Retry</button>
        <button>重新整理頁面 / Reload Page</button>
      </div>
    )
  }
}
```

**Problem:** 
- Shows BOTH Chinese and English simultaneously
- User cannot change which language appears
- Defeats the purpose of language switching

---

### AFTER (CORRECT)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/ErrorBoundary.tsx
// Note: ErrorBoundary needs access to language context

import { useLanguage } from '../i18n/useLanguage'

function ErrorBoundaryContent({ error, onReset }: ErrorProps) {
  const { t } = useLanguage()
  
  return (
    <div>
      <h1 style={{ color: '#dc3545' }}>
        {t('error.title')}
      </h1>
      <p>{t('error.message')}</p>
      <details>
        <summary>{t('error.details')}</summary>
        {/* ... */}
      </details>
      <button onClick={onReset}>{t('error.retry')}</button>
      <button onClick={() => location.reload()}>{t('error.reload')}</button>
    </div>
  )
}
```

**Added to translations.ts:**
```typescript
export type TranslationKey = 
  | 'error.title'
  | 'error.message'
  | 'error.details'
  | 'error.retry'
  | 'error.reload'
  // ... rest

// In zh bundle:
'error.title': '⚠️ 應用程式發生錯誤',
'error.message': '抱歉，應用程式遇到了問題。請嘗試重新整理頁面。',
'error.details': '技術細節',
'error.retry': '重試',
'error.reload': '重新整理頁面',

// In en bundle:
'error.title': 'Application Error',
'error.message': 'Sorry, the application encountered a problem. Please try refreshing the page.',
'error.details': 'Technical Details',
'error.retry': 'Retry',
'error.reload': 'Reload Page',
```

---

## BUG #2: PluginManagerPanel - Bilingual Text

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/PluginManagerPanel.tsx

export function PluginManagerPanel() {
  const { loading } = usePlugins()
  
  return (
    <button disabled={loading}>
      {loading ? '更新中… / Loading…' : '重新整理 / Refresh'}
    </button>
  )
}

// More examples:
<p className="panel__empty">尚未註冊任何插件。 / No plugins yet.</p>
<span>{plugin.enabled ? '啟用 / Enabled' : '停用 / Disabled'}</span>
<p>功能 / Capabilities: {plugin.capabilities.join(', ')}</p>
```

**Problem:** 
- Every label shows both Chinese and English
- User cannot select which language to see
- Inconsistent with rest of application

---

### AFTER (CORRECT)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/PluginManagerPanel.tsx

import { useLanguage } from '../i18n/useLanguage'

export function PluginManagerPanel() {
  const { t } = useLanguage()
  const { loading } = usePlugins()
  
  return (
    <button disabled={loading}>
      {loading ? t('plugin.loading') : t('plugin.refresh')}
    </button>
  )
}

// More examples:
<p className="panel__empty">
  {plugins.length === 0 ? t('plugin.empty') : null}
</p>
<span>
  {plugin.enabled ? t('plugin.enabled') : t('plugin.disabled')}
</span>
<p>
  {t('plugin.capabilities')}: {plugin.capabilities.join(', ')}
</p>
```

**Added to translations.ts:**
```typescript
| 'plugin.loading'
| 'plugin.refresh'
| 'plugin.empty'
| 'plugin.enabled'
| 'plugin.disabled'
| 'plugin.capabilities'

// In zh bundle:
'plugin.loading': '更新中…',
'plugin.refresh': '重新整理',
'plugin.empty': '尚未註冊任何插件。',
'plugin.enabled': '啟用',
'plugin.disabled': '停用',
'plugin.capabilities': '功能',

// In en bundle:
'plugin.loading': 'Loading…',
'plugin.refresh': 'Refresh',
'plugin.empty': 'No plugins yet.',
'plugin.enabled': 'Enabled',
'plugin.disabled': 'Disabled',
'plugin.capabilities': 'Capabilities',
```

---

## BUG #3: AiChatPanel - Hardcoded Quick Action Prompts

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx
// Lines: 224-263

const quickActions = useMemo(() => {
  if (language === 'zh') {
    return [
      {
        label: t('chat.quickActions.adjustClimate'),
        // Hardcoded Chinese - not in translations.ts!
        prompt: '請把溫度調成 24°C、濕度 52%，並確認 autoset 是否開啟。',
      },
      {
        label: t('chat.quickActions.checkWater'),
        // Hardcoded Chinese - not in translations.ts!
        prompt: '看看我家貓咪今天喝水量是否足夠，並給補水建議。',
      },
      {
        label: t('chat.quickActions.analyzePhoto'),
        // Hardcoded Chinese - not in translations.ts!
        prompt: '等等我會上傳一張照片，請幫我分析環境是否舒適與安全。',
      },
      {
        label: t('chat.quickActions.logMemory'),
        // Hardcoded Chinese - not in translations.ts!
        prompt: '請幫我記住：早上 9 點餵食濕食、晚上 7 點餵食乾糧，貓咪喜歡雞肉口味。',
      },
    ]
  }
  // English prompts are hardcoded here too
  return [
    {
      label: t('chat.quickActions.adjustClimate'),
      prompt: 'Please set the habitat to 24°C, 52% humidity, and confirm Autoset is on.',
    },
    // ...
  ]
}, [language, t])
```

**Problem:**
- Prompts are hardcoded in component, not in `translations.ts`
- Cannot centrally manage translations
- Difficult to update or add new languages
- Inconsistent: labels use i18n, but prompts don't

---

### AFTER (CORRECT)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx

const quickActions = useMemo(() => {
  return [
    {
      label: t('chat.quickActions.adjustClimate'),
      prompt: t('chat.quickActions.adjustClimate.prompt'),
    },
    {
      label: t('chat.quickActions.checkWater'),
      prompt: t('chat.quickActions.checkWater.prompt'),
    },
    {
      label: t('chat.quickActions.analyzePhoto'),
      prompt: t('chat.quickActions.analyzePhoto.prompt'),
    },
    {
      label: t('chat.quickActions.logMemory'),
      prompt: t('chat.quickActions.logMemory.prompt'),
    },
  ]
}, [t])
```

**Added to translations.ts:**
```typescript
| 'chat.quickActions.adjustClimate.prompt'
| 'chat.quickActions.checkWater.prompt'
| 'chat.quickActions.analyzePhoto.prompt'
| 'chat.quickActions.logMemory.prompt'

// In zh bundle:
'chat.quickActions.adjustClimate.prompt': '請把溫度調成 24°C、濕度 52%，並確認 autoset 是否開啟。',
'chat.quickActions.checkWater.prompt': '看看我家貓咪今天喝水量是否足夠，並給補水建議。',
'chat.quickActions.analyzePhoto.prompt': '等等我會上傳一張照片，請幫我分析環境是否舒適與安全。',
'chat.quickActions.logMemory.prompt': '請幫我記住：早上 9 點餵食濕食、晚上 7 點餵食乾糧，貓咪喜歡雞肉口味。',

// In en bundle:
'chat.quickActions.adjustClimate.prompt': 'Please set the habitat to 24°C, 52% humidity, and confirm Autoset is on.',
'chat.quickActions.checkWater.prompt': "Check if today's hydration is sufficient and suggest a refill plan.",
'chat.quickActions.analyzePhoto.prompt': 'I will upload a photo shortly—please analyse safety and comfort for my cat.',
'chat.quickActions.logMemory.prompt': 'Log a memory: feed wet food at 9 AM, dry food at 7 PM, prefers chicken flavour.',
```

---

## BUG #4: AiChatPanel - Hardcoded Tone Detection Keywords

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx
// Lines: 267-302

const inferTone = useCallback(
  (content: string) => {
    const normalized = content.toLowerCase()
    
    // URGENT tone detection
    if (
      /[⚠️🚨🔴]/u.test(content) ||
      normalized.includes('urgent') ||
      normalized.includes('alert') ||
      normalized.includes('warning') ||
      content.includes('緊急') ||    // HARDCODED CHINESE
      content.includes('注意') ||    // HARDCODED CHINESE
      content.includes('警報')       // HARDCODED CHINESE
    ) {
      return 'urgent'
    }
    
    // CELEBRATE tone detection
    if (
      normalized.includes('congrats') ||
      normalized.includes('great job') ||
      normalized.includes('awesome') ||
      content.includes('恭喜') ||    // HARDCODED CHINESE
      content.includes('太棒')       // HARDCODED CHINESE
    ) {
      return 'celebrate'
    }
    
    // CALM tone detection
    if (
      normalized.includes('relax') ||
      normalized.includes('calm') ||
      normalized.includes('breathe') ||
      content.includes('放鬆') ||    // HARDCODED CHINESE
      content.includes('安心')       // HARDCODED CHINESE
    ) {
      return 'calm'
    }
    
    return 'gentle'
  },
  [language],
)
```

**Problem:**
- Chinese keywords are hardcoded directly in function
- If translations change, code must be updated
- Cannot parameterize keyword lists
- Fragile implementation

---

### AFTER (CORRECT - Option A: Configuration-based)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx

// Create a configuration mapping
const TONE_KEYWORDS = {
  urgent: {
    en: ['urgent', 'alert', 'warning'],
    zh: ['緊急', '注意', '警報'],
  },
  celebrate: {
    en: ['congrats', 'great job', 'awesome'],
    zh: ['恭喜', '太棒'],
  },
  calm: {
    en: ['relax', 'calm', 'breathe'],
    zh: ['放鬆', '安心'],
  },
} as const

const inferTone = useCallback(
  (content: string) => {
    const normalized = content.toLowerCase()
    const langKey = language as keyof typeof TONE_KEYWORDS.urgent
    
    // URGENT tone detection
    if (
      /[⚠️🚨🔴]/u.test(content) ||
      TONE_KEYWORDS.urgent[language].some(keyword => 
        normalized.includes(keyword)
      )
    ) {
      return 'urgent'
    }
    
    // CELEBRATE tone detection
    if (
      TONE_KEYWORDS.celebrate[language].some(keyword =>
        normalized.includes(keyword)
      )
    ) {
      return 'celebrate'
    }
    
    // CALM tone detection
    if (
      TONE_KEYWORDS.calm[language].some(keyword =>
        normalized.includes(keyword)
      )
    ) {
      return 'calm'
    }
    
    return 'gentle'
  },
  [language],
)
```

### AFTER (CORRECT - Option B: Translation-based)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx

const getToneKeywords = (lang: Language) => ({
  urgent: {
    en: ['urgent', 'alert', 'warning'],
    zh: [
      t('chat.tone.urgent.keyword.1'),
      t('chat.tone.urgent.keyword.2'),
      t('chat.tone.urgent.keyword.3'),
    ],
  },
  celebrate: {
    en: ['congrats', 'great job', 'awesome'],
    zh: [
      t('chat.tone.celebrate.keyword.1'),
      t('chat.tone.celebrate.keyword.2'),
    ],
  },
  calm: {
    en: ['relax', 'calm', 'breathe'],
    zh: [
      t('chat.tone.calm.keyword.1'),
      t('chat.tone.calm.keyword.2'),
    ],
  },
})

const inferTone = useCallback(
  (content: string) => {
    const normalized = content.toLowerCase()
    const keywords = getToneKeywords(language)
    
    if (
      /[⚠️🚨🔴]/u.test(content) ||
      keywords.urgent[language].some(k => normalized.includes(k))
    ) {
      return 'urgent'
    }
    
    if (keywords.celebrate[language].some(k => normalized.includes(k))) {
      return 'celebrate'
    }
    
    if (keywords.calm[language].some(k => normalized.includes(k))) {
      return 'calm'
    }
    
    return 'gentle'
  },
  [language, t],
)
```

---

## BUG #5: AiChatPanel - Voice Settings Labels

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx
// Lines: 670, 689

<div className="ai-chat__voice-settings">
  <label>
    {/* HARDCODED TERNARY - should use i18n */}
    <span>{language === 'zh' ? '語音' : 'Voice preset'}</span>
    <div className="ai-chat__voice-select">
      {/* ... */}
      <button
        aria-label={language === 'zh' ? '重新載入語音' : 'Refresh voices'}
        {/* ... */}
      >
        ⟳
      </button>
    </div>
  </label>
</div>
```

**Problem:**
- Uses inline ternary instead of i18n
- Bypasses translation system
- Inconsistent with rest of codebase

---

### AFTER (CORRECT)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx

<div className="ai-chat__voice-settings">
  <label>
    <span>{t('chat.voice.label')}</span>
    <div className="ai-chat__voice-select">
      {/* ... */}
      <button
        aria-label={t('chat.voice.refresh')}
        {/* ... */}
      >
        ⟳
      </button>
    </div>
  </label>
</div>
```

**Added to translations.ts:**
```typescript
| 'chat.voice.label'
| 'chat.voice.refresh'

// In zh bundle:
'chat.voice.label': '語音',
'chat.voice.refresh': '重新載入語音',

// In en bundle:
'chat.voice.label': 'Voice preset',
'chat.voice.refresh': 'Refresh voices',
```

---

## BUG #6: CareInsightsPanel - Hardcoded Text with Language Ternary

### BEFORE (WRONG)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/CareInsightsPanel.tsx
// Lines: 62, 141, 146

const metaText = useMemo(() => {
  const timestamp = generatedAt ? new Date(generatedAt).toLocaleString() : '—'
  // HARDCODED with ternary
  const samplesLabel = language === 'en' 
    ? `Samples ${sampleCount ?? 0}` 
    : `樣本 ${sampleCount ?? 0}`
  return `${timestamp} · ${samplesLabel}`
}, [generatedAt, language, sampleCount])

// Later in render:
{language === 'en' 
  ? `· Reference ${evidence.baseline}` 
  : `· 參考 ${evidence.baseline}`}

{language === 'en' 
  ? ` (${evidence.note})` 
  : `（${evidence.note}）`}
```

**Problem:**
- Text hardcoded with ternary instead of using i18n
- Punctuation variations hardcoded (English `()` vs Chinese `（）`)
- Uses inverted pattern `language === 'en'` instead of consistent style

---

### AFTER (CORRECT)
```typescript
// File: /Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/CareInsightsPanel.tsx

const metaText = useMemo(() => {
  const timestamp = generatedAt ? new Date(generatedAt).toLocaleString() : '—'
  const samplesLabel = t('careInsights.samples', { count: sampleCount ?? 0 })
  return `${timestamp} · ${samplesLabel}`
}, [generatedAt, t, sampleCount])

// Later in render:
{evidence.baseline ? (
  <span className="care-insight__baseline">
    {t('careInsights.reference', { value: evidence.baseline })}
  </span>
) : null}

{evidence.note ? (
  <span className="care-insight__note">
    {t('careInsights.note', { text: evidence.note })}
  </span>
) : null}
```

**Added to translations.ts:**
```typescript
| 'careInsights.samples'
| 'careInsights.reference'
| 'careInsights.note'

// In zh bundle:
'careInsights.samples': '樣本 {{count}}',
'careInsights.reference': '· 參考 {{value}}',
'careInsights.note': '（{{text}}）',

// In en bundle:
'careInsights.samples': 'Samples {{count}}',
'careInsights.reference': '· Reference {{value}}',
'careInsights.note': ' ({{text}})',
```

---

## Summary: Key Patterns

### WRONG PATTERNS TO AVOID
```typescript
// Pattern 1: Inline ternary with hardcoded text
{language === 'zh' ? '中文' : 'English'}

// Pattern 2: Hardcoded strings not in translations.ts
const label = '硬编码的中文'

// Pattern 3: Bilingual fallback (showing both languages)
'中文 / English'

// Pattern 4: Ternary for formatting only
.join(language === 'zh' ? '、' : ',')
```

### CORRECT PATTERNS TO USE
```typescript
// Pattern 1: Always use t() function
{t('translation.key')}

// Pattern 2: Use translation keys with variables
{t('message.with.variable', { name: 'value' })}

// Pattern 3: Language-based formatting through i18n
// (Include punctuation in translation strings)

// Pattern 4: Configuration-based lists
const KEYWORDS = { en: [...], zh: [...] }
```

---

