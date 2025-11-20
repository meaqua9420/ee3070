# Internationalization (i18n) Language Bug Analysis Report
## EE3070 Smart Cat Home - Frontend (smart-cat-home)

Generated: 2025-11-02

---

## Executive Summary

The codebase has **CRITICAL i18n bugs** causing language mixing issues. Multiple hardcoded Chinese and English text strings bypass the i18n system, and inline language conditionals in components break the translation flow. When switching between languages, users will see mixed content in both English mode and Chinese mode.

### Severity: HIGH
- Multiple components with hardcoded text that should be i18n keys
- Inline language conditionals creating inconsistent UI patterns
- Non-translatable hardcoded strings in critical user-facing areas
- Chinese punctuation logic hardcoded instead of i18n-driven

---

## 1. CRITICAL BUGS: Hardcoded Chinese Text

### Bug 1.1: AiChatPanel - Quick Action Prompts (CRITICAL)
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx`
**Lines:** 225-263

**Issue:** Quick action prompt text is hardcoded in Chinese, not internationalized.

```typescript
// Lines 224-263
const quickActions = useMemo(() => {
  if (language === 'zh') {
    return [
      {
        label: t('chat.quickActions.adjustClimate'),
        prompt: '請把溫度調成 24°C、濕度 52%，並確認 autoset 是否開啟。',  // LINE 229 - HARDCODED CHINESE
      },
      {
        label: t('chat.quickActions.checkWater'),
        prompt: '看看我家貓咪今天喝水量是否足夠，並給補水建議。',  // LINE 233 - HARDCODED CHINESE
      },
      {
        label: t('chat.quickActions.analyzePhoto'),
        prompt: '等等我會上傳一張照片，請幫我分析環境是否舒適與安全。',  // LINE 237 - HARDCODED CHINESE
      },
      {
        label: t('chat.quickActions.logMemory'),
        prompt: '請幫我記住：早上 9 點餵食濕食、晚上 7 點餵食乾糧，貓咪喜歡雞肉口味。',  // LINE 241 - HARDCODED CHINESE
      },
    ]
  }
  // English prompts are also here but properly hardcoded, not i18n'd
  return [ ... ]
}, [language, t])
```

**Problem:**
- These prompts are hardcoded, not stored in `translations.ts`
- They appear only when `language === 'zh'`
- No translation keys like `'chat.quickActions.adjustClimate.prompt'` exist

**Impact:**
- Chinese users see hardcoded Chinese prompts in the UI
- If translation keys were missing, English prompts would still appear hardcoded
- Cannot manage translations centrally in `translations.ts`

**Root Cause:** Developer mixed prompt content with i18n key system (labels use `t()`, but prompts don't)

---

### Bug 1.2: AiChatPanel - Tone Detection Hardcoded Chinese Keywords
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx`
**Lines:** 267-302

**Issue:** Chinese keywords for tone detection are hardcoded directly in component logic.

```typescript
// Lines 267-302
const inferTone = useCallback(
  (content: string) => {
    const normalized = content.toLowerCase()
    if (
      /[⚠️🚨🔴]/u.test(content) ||
      normalized.includes('urgent') ||
      normalized.includes('alert') ||
      normalized.includes('warning') ||
      content.includes('緊急') ||      // LINE 275 - HARDCODED
      content.includes('注意') ||      // LINE 276 - HARDCODED
      content.includes('警報')         // LINE 277 - HARDCODED
    ) {
      return 'urgent'
    }
    if (
      normalized.includes('congrats') ||
      normalized.includes('great job') ||
      normalized.includes('awesome') ||
      content.includes('恭喜') ||      // LINE 285 - HARDCODED
      content.includes('太棒')         // LINE 286 - HARDCODED
    ) {
      return 'celebrate'
    }
    if (
      normalized.includes('relax') ||
      normalized.includes('calm') ||
      normalized.includes('breathe') ||
      content.includes('放鬆') ||      // LINE 294 - HARDCODED
      content.includes('安心')         // LINE 295 - HARDCODED
    ) {
      return 'calm'
    }
    return 'gentle'
  },
  [language],
)
```

**Problem:**
- Chinese keywords are hardcoded in the component instead of being configurable
- If Chinese translations change or new keywords are added, code must be modified
- Mixed approach: English keywords are detected but Chinese keywords are hardcoded

**Impact:**
- Fragile implementation - Chinese keyword detection breaks if translations change
- Maintenance nightmare - translations not centralized
- When language is 'en', Chinese keywords 緊急, 注意, 警報, 恭喜, 太棒, 放鬆, 安心 will NOT trigger correct tone
- Inconsistent tone detection behavior between languages

**Root Cause:** Hardcoded keyword matching instead of using i18n configuration or translation mapping

---

### Bug 1.3: AiChatPanel - Voice Settings Label (DISPLAY BUG)
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx`
**Lines:** 670, 689

**Issue:** Voice settings label uses inline language conditional instead of i18n.

```typescript
// LINE 670
<span>{language === 'zh' ? '語音' : 'Voice preset'}</span>

// LINE 689
aria-label={language === 'zh' ? '重新載入語音' : 'Refresh voices'}
```

**Problem:**
- Text is hardcoded in ternary conditional, not in `translations.ts`
- Bypasses i18n system completely
- These strings should have translation keys like `'chat.voice.label'` and `'chat.voice.refresh'`

**Impact:**
- When language is switched, these labels will show the wrong language
- Cannot manage voice-related translations in translation files
- Inconsistent pattern across codebase (other labels use `t()`)

---

### Bug 1.4: ErrorBoundary - Hardcoded Bilingual Text
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/ErrorBoundary.tsx`
**Lines:** 45, 85, 88, 97, 128, 142

**Issue:** Error boundary contains hardcoded bilingual text instead of language-aware rendering.

```typescript
// Line 45 - Comment only
// 重置錯誤狀態，重新渲染子元件
// Reset error state and re-render children

// Line 85
⚠️ 應用程式發生錯誤 / Application Error

// Line 88
抱歉，應用程式遇到了問題。請嘗試重新整理頁面。
Sorry, the application encountered a problem. Please try refreshing the page.

// Line 97
技術細節 / Technical Details

// Line 128
重試 / Retry

// Line 142
重新整理頁面 / Reload Page
```

**Problem:**
- Shows BOTH Chinese AND English simultaneously (bilingual fallback)
- Instead of respecting language setting, it displays both languages
- When user selects English, Chinese text is still visible
- When user selects Chinese, English text is still visible

**Impact:**
- User sees mixed Chinese/English UI even after language selection
- Defeats the purpose of language switching
- Professional appearance compromised

**Root Cause:** Hardcoded bilingual strings instead of language-conditional rendering

---

### Bug 1.5: PluginManagerPanel - Hardcoded Bilingual Text
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/PluginManagerPanel.tsx`
**Lines:** 67, 72, 80, 85, 88, 100, 109

**Issue:** Multiple hardcoded bilingual strings in plugin manager.

```typescript
// Line 67
{loading ? '更新中… / Loading…' : '重新整理 / Refresh'}

// Line 72
尚未註冊任何插件。 / No plugins yet.

// Line 80
{plugin.enabled ? '啟用 / Enabled' : '停用 / Disabled'}

// Line 85
功能 / Capabilities: {plugin.capabilities.join(', ')}

// Line 88
API：{plugin.apiBaseUrl}

// Line 100
{plugin.enabled ? '停用 / Disable' : '啟用 / Enable'}

// Line 109
移除 / Remove
```

**Problem:**
- All strings are hardcoded bilingual (Chinese / English)
- No use of `t()` function or i18n keys
- Should have keys like `'plugin.loading'`, `'plugin.empty'`, `'plugin.enabled'`, etc.

**Impact:**
- Users always see both Chinese and English simultaneously
- No proper language switching for plugin manager
- Inconsistent with rest of UI that properly uses i18n

---

### Bug 1.6: CareInsightsPanel - Hardcoded English Ternary
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/CareInsightsPanel.tsx`
**Lines:** 62, 141, 146

**Issue:** Hardcoded English/Chinese text with language conditionals (INVERTED PATTERN).

```typescript
// Line 62
const samplesLabel = language === 'en' ? `Samples ${sampleCount ?? 0}` : `樣本 ${sampleCount ?? 0}`

// Line 141
{language === 'en' ? `· Reference ${evidence.baseline}` : `· 參考 ${evidence.baseline}`}

// Line 146
{language === 'en' ? ` (${evidence.note})` : `（${evidence.note}）`}
```

**Problem:**
- Hardcoded text with ternary conditionals instead of using `t()` and translation keys
- English punctuation `()` and Chinese punctuation `（）` are hardcoded
- Uses `language === 'en'` pattern (inverted from other components which use `language === 'zh'`)

**Impact:**
- Cannot manage these strings in translation files
- Punctuation variations are not i18n-driven
- Difficult to update or add new languages

---

## 2. I18N IMPLEMENTATION ISSUES

### Issue 2.1: Language Storage and Initialization
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/i18n/LanguageProvider.tsx`
**Lines:** 13-29

**Current Implementation:**
```typescript
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
```

**Issues:**
- Default language is hardcoded to `'zh'` (Chinese) in two places (lines 15, 28)
- Not configurable
- Browser language detection only checks for English prefix, defaults to Chinese otherwise

**Assessment:** This is ACCEPTABLE for now, but should be configurable.

---

### Issue 2.2: Translation Fallback Mechanism
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/i18n/translations.ts`
**Lines:** 2179-2196

**Current Implementation:**
```typescript
export function translate(
  language: Language,
  key: TranslationKey,
  variables?: Record<string, string | number>,
): string {
  const dictionary = translationBundles[language]
  const fallback = translationBundles.en
  const template = dictionary?.[key] ?? fallback[key] ?? key

  if (!variables) {
    return template
  }

  return template.replace(/\{\{(.*?)\}\}/g, (_, varName: string) => {
    const value = variables[varName.trim()]
    return value !== undefined ? String(value) : ''
  })
}
```

**Issues:**
- Fallback is ALWAYS English (`fallback = translationBundles.en`)
- If Chinese translation is missing, shows English
- If translation key doesn't exist in either, returns the KEY itself as fallback

**Assessment:** ACCEPTABLE - proper fallback chain is in place.

---

## 3. LANGUAGE DETECTION LOGIC

### Issue 3.1: Browser Language Detection
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/i18n/LanguageProvider.tsx`
**Lines:** 23-26

```typescript
const navigatorLang = window.navigator.language?.toLowerCase() ?? ''
if (navigatorLang.startsWith('en')) {
  return 'en'
}

return 'zh'
```

**Issues:**
- Only recognizes English (`en`, `en-US`, `en-GB`, etc.)
- Everything else defaults to Chinese
- Browser set to other languages (fr, de, es, etc.) will get Chinese UI
- This is acceptable since only 2 languages are supported

**Assessment:** ACCEPTABLE - appropriate for 2-language system.

---

## 4. HARDCODED PUNCTUATION AND FORMATTING

### Issue 4.1: StatusOverview - Chinese Punctuation Hardcoded
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/StatusOverview.tsx`
**Line:** 123

```typescript
const detail =
  active.length === 0
    ? t('overview.devices.idle')
    : active
        .map((label) => label)
        .join(language === 'zh' ? '、' : ', ')
```

**Problem:**
- Chinese separator `、` vs English comma `,` is hardcoded
- Should be i18n-driven if these strings are translated differently

**Assessment:** MINOR - acceptable for punctuation variance based on language.

---

### Issue 4.2: App.tsx - Feeding Unit Hardcoded
**File:** `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/App.tsx`
**Lines:** 741, 891

```typescript
// Line 741
const locale = language === 'zh' ? 'zh-TW' : 'en-US'

// Line 891
const feedingUnit = language === 'zh' ? '分鐘' : 'min'
```

**Problem:**
- Locale formatting is correctly determined by language
- But `feedingUnit` is hardcoded instead of being translated via `t('control.feedingUnit')`

**Impact:**
- Inconsistent approach (locale is language-aware, but unit is hardcoded)
- Should use i18n key: `t('control.feedingUnit')`

---

## 5. LANGUAGE-CONDITIONAL HARDCODING PATTERN

### Issue 5.1: Widespread Pattern of Inline Language Ternaries
Multiple files use this anti-pattern:
```typescript
{language === 'zh' ? '中文文本' : 'English text'}
```

**Files with this pattern:**
- `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/AiChatPanel.tsx` (lines 670, 689)
- `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/CareInsightsPanel.tsx` (lines 62, 141, 146)
- `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/StatusOverview.tsx` (line 123)
- `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/ControlPanel.tsx` (line 161)

**Problem:**
- Bypasses `translations.ts` completely
- Cannot manage strings centrally
- Difficult to add new languages
- Creates maintenance burden

**Best Practice Violation:**
- Should use: `t('translation.key')`
- NOT: `language === 'zh' ? '中文' : 'English'`

---

## SUMMARY OF BUGS

### Critical (Show-Stoppers)
1. **AiChatPanel Quick Action Prompts** - Hardcoded Chinese, not translatable
2. **AiChatPanel Tone Detection** - Hardcoded Chinese keywords
3. **ErrorBoundary Bilingual Text** - Shows both Chinese AND English at once
4. **PluginManagerPanel Bilingual Text** - Shows both Chinese AND English at once

### High Priority
5. **AiChatPanel Voice Settings** - Hardcoded inline language conditionals
6. **CareInsightsPanel Hardcoded Text** - Multiple hardcoded labels with language conditionals

### Medium Priority
7. **ControlPanel Feeder Placeholder** - Hardcoded instead of i18n
8. **StatusOverview Separator** - Hardcoded punctuation (but acceptable)
9. **App.tsx Feeding Unit** - Hardcoded instead of translated

---

## ROOT CAUSES

1. **Inconsistent Implementation**: Some components use `t()`, others use hardcoded ternaries
2. **Mixed Patterns**: Labels sometimes use i18n, but content uses hardcoded text
3. **Developer Oversight**: Components were added without following i18n conventions
4. **Bilingual Fallback Anti-Pattern**: ErrorBoundary and PluginManagerPanel show both languages instead of respecting language setting
5. **Keyword Hardcoding**: AiChatPanel uses hardcoded Chinese keywords for tone detection instead of parameterizable list

---

## RECOMMENDED FIXES

### Fix 1: Add Missing Translation Keys
Add to `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/i18n/translations.ts`:

```typescript
// Add to TranslationKey type:
| 'chat.quickActions.adjustClimate.prompt'
| 'chat.quickActions.checkWater.prompt'
| 'chat.quickActions.analyzePhoto.prompt'
| 'chat.quickActions.logMemory.prompt'
| 'chat.tone.urgent.keyword.1'
| 'chat.tone.urgent.keyword.2'
| 'chat.tone.urgent.keyword.3'
| 'chat.tone.celebrate.keyword.1'
| 'chat.tone.celebrate.keyword.2'
| 'chat.tone.calm.keyword.1'
| 'chat.tone.calm.keyword.2'
| 'chat.voice.label'
| 'chat.voice.refresh'
| 'plugin.loading'
| 'plugin.empty'
| 'plugin.enabled'
| 'plugin.disabled'
| 'plugin.capabilities'
| 'plugin.api'
| 'error.title'
| 'error.message'
| 'error.details'
| 'error.retry'
| 'error.reload'
| 'careInsights.samples'
| 'careInsights.reference'
| 'control.feedingUnit'

// Add to both 'zh' and 'en' translation bundles...
```

### Fix 2: Refactor AiChatPanel
Replace hardcoded prompts with translation keys:

```typescript
const quickActions = useMemo(() => {
  return [
    {
      label: t('chat.quickActions.adjustClimate'),
      prompt: t('chat.quickActions.adjustClimate.prompt'),
    },
    // ... etc
  ]
}, [t])
```

### Fix 3: Extract Tone Detection Keywords
Create a configuration object or translation mapping:

```typescript
const toneKeywords = {
  urgent: {
    en: ['urgent', 'alert', 'warning'],
    zh: [t('chat.tone.urgent.keyword.1'), t('chat.tone.urgent.keyword.2'), t('chat.tone.urgent.keyword.3')],
  },
  celebrate: {
    en: ['congrats', 'great job', 'awesome'],
    zh: [t('chat.tone.celebrate.keyword.1'), t('chat.tone.celebrate.keyword.2')],
  },
  // etc
}
```

### Fix 4: Refactor Voice Settings
Replace ternary with i18n key:

```typescript
// Before:
<span>{language === 'zh' ? '語音' : 'Voice preset'}</span>

// After:
<span>{t('chat.voice.label')}</span>
```

### Fix 5: Fix ErrorBoundary
Replace bilingual text with language-conditional rendering:

```typescript
// Before:
<h1>⚠️ 應用程式發生錯誤 / Application Error</h1>
<p>抱歉，應用程式遇到了問題。請嘗試重新整理頁面。</p>
<p>Sorry, the application encountered a problem. Please try refreshing the page.</p>

// After:
<h1>{t('error.title')}</h1>
<p>{t('error.message')}</p>
```

Note: ErrorBoundary needs access to language context. Consider:
- Wrapping ErrorBoundary inside LanguageProvider
- Or passing translations as prop

### Fix 6: Fix PluginManagerPanel
Remove bilingual text, use i18n:

```typescript
// Before:
{loading ? '更新中… / Loading…' : '重新整理 / Refresh'}

// After:
{loading ? t('plugin.loading') : t('plugin.refresh')}
```

---

## VERIFICATION CHECKLIST

- [ ] All hardcoded Chinese text has been moved to `translations.ts`
- [ ] All hardcoded English text has been moved to `translations.ts`
- [ ] No `language === 'zh' ? '中文' : 'English'` patterns remain in components
- [ ] No `language === 'en' ? 'English' : '中文'` patterns remain in components
- [ ] All visible text uses `t('key')` function
- [ ] ErrorBoundary shows only selected language, not both
- [ ] PluginManagerPanel shows only selected language, not both
- [ ] Tone detection keywords are no longer hardcoded in AiChatPanel
- [ ] All translation keys have entries in both 'zh' and 'en' bundles
- [ ] No bilingual strings like `'中文 / English'` appear in source code

---

## TIMELINE IMPACT

**Critical Issues (Implement First):**
- ErrorBoundary and PluginManagerPanel bilingual text
- AiChatPanel quick action prompts

**High Priority (Implement Second):**
- AiChatPanel tone detection keywords
- Voice settings labels

**Medium Priority (Implement Third):**
- CareInsightsPanel hardcoded text
- ControlPanel feeder unit
- App.tsx feeding unit

---

## CONCLUSION

The i18n implementation has a solid foundation with proper `translations.ts` structure and context-based language management. However, multiple components have bypassed the i18n system with hardcoded text, ternary conditionals, and bilingual fallbacks. This creates a fragmented user experience where language switching doesn't work consistently across the entire application.

The fixes are straightforward but require systematic refactoring to ensure all visible text flows through the i18n system.

