import { useMemo, useState, useEffect, useCallback, useRef, lazy, Fragment, Suspense } from 'react'
import { AlertBanner } from './components/AlertBanner'
import { DataCard } from './components/DataCard'
import { InlineNotice } from './components/InlineNotice'
import { HeroSummary } from './components/HeroSummary'
import { StatusOverview } from './components/StatusOverview'
import { RealtimeQuickVitals, type QuickVital } from './components/RealtimeQuickVitals'
import { AiSummaryCard } from './components/AiSummaryCard'
import { ControlPanel } from './components/ControlPanel'
import { CatSwitcher } from './components/CatSwitcher'
import { HardwareProfileSwitcher } from './components/HardwareProfileSwitcher'
import { PetTypeSwitcher } from './components/PetTypeSwitcher'
import { useSmartHomeData } from './hooks/useSmartHomeData'
import { usePetProfile } from './hooks/usePetProfile'
import { useAutomationAlerts } from './hooks/useAutomationAlerts'
import { useBackendHealth } from './hooks/useBackendHealth'
import { useMemories } from './hooks/useMemories'
import { useAlertRules } from './hooks/useAlertRules'
import { useMemoryKeywords } from './hooks/useMemoryKeywords'
import { useChatFavorites } from './hooks/useChatFavorites'
import { useCareInsights } from './hooks/useCareInsights'
import { useBehaviorForecast } from './hooks/useBehaviorForecast'
import { useBehaviorProfile } from './hooks/useBehaviorProfile'
import { useCareTasks } from './hooks/useCareTasks'
import { useCarePlugins } from './hooks/useCarePlugins'
import { useCats } from './hooks/useCats'
import { useDashboardLayout } from './hooks/useDashboardLayout'
import { useDeferredActivation } from './hooks/useDeferredActivation'
import './App.css'
import {
  ensurePushSubscription,
  ensureNativePushRegistration,
  isNativePushEnvironment,
  pushNotificationWorker,
  sendTestNotification,
} from './utils/pushNotifications'
import { playWarningTone } from './utils/alertSound'
import { useLanguage } from './i18n/useLanguage'
import type { Language, TranslationKey } from './i18n/translations'
import { generateInsights } from './utils/aiAdvisor'
import { buildAiSummary } from './utils/aiSummary'
import { getTimeBasedTheme, type ManualTheme } from './utils/theme'
import type {
  MemoryType,
  ToolEventSummary,
  AIInsightRecommendation,
  SmartHomeSettings,
  CareInsight,
  SmartHomeSnapshot,
  HardwareProfile,
} from './types/smartHome'
import { API_BASE_URL, pinToolEventSummary, unpinToolEventSummary, setHardwareProfileHeader } from './utils/backendClient'
import { Loader } from './components/Loader'
import { useAuth } from './hooks/useAuth'
import type { AuthUser } from './types/auth'
import { LoginPanel } from './components/LoginPanel'
import { MobileSectionNav } from './components/MobileSectionNav'

// Lazy load heavy components - grouped by feature
const AIAdvisor = lazy(() => import('./components/AIAdvisor').then(m => ({ default: m.AIAdvisor })))
const AiChatPanel = lazy(() => import('./components/AiChatPanel').then(m => ({ default: m.AiChatPanel })))
const AiStatusCard = lazy(() => import('./components/AiStatusCard').then(m => ({ default: m.AiStatusCard })))
const AiHighlightsCard = lazy(() => import('./components/AiHighlightsCard').then(m => ({ default: m.AiHighlightsCard })))

const CareCommandCenter = lazy(() => import('./components/CareCommandCenter').then(m => ({ default: m.CareCommandCenter })))
const CareInsightsPanel = lazy(() => import('./components/CareInsightsPanel').then(m => ({ default: m.CareInsightsPanel })))
const BehaviorForecastCard = lazy(() => import('./components/BehaviorForecastCard').then(m => ({ default: m.BehaviorForecastCard })))
const BehaviorProfileCard = lazy(() => import('./components/BehaviorProfileCard').then(m => ({ default: m.BehaviorProfileCard })))
const CareTaskBoard = lazy(() => import('./components/CareTaskBoard').then(m => ({ default: m.CareTaskBoard })))
const HighRiskOverview = lazy(() => import('./components/HighRiskOverview').then(m => ({ default: m.HighRiskOverview })))

const AutomationAlerts = lazy(() => import('./components/AutomationAlerts').then(m => ({ default: m.AutomationAlerts })))
const AlertRuleManager = lazy(() => import('./components/AlertRuleManager').then(m => ({ default: m.AlertRuleManager })))
const TrendCharts = lazy(() => import('./components/TrendCharts').then(m => ({ default: m.TrendCharts })))
const HistorySummary = lazy(() => import('./components/HistorySummary').then(m => ({ default: m.HistorySummary })))
const HistoryInspector = lazy(() => import('./components/HistoryInspector').then(m => ({ default: m.HistoryInspector })))

const DeviceStatusList = lazy(() => import('./components/DeviceStatusList').then(m => ({ default: m.DeviceStatusList })))
const UsageGuide = lazy(() => import('./components/UsageGuide').then(m => ({ default: m.UsageGuide })))
const CalibrationPanel = lazy(() => import('./components/CalibrationPanel').then(m => ({ default: m.CalibrationPanel })))
const PerformancePanel = lazy(() => import('./components/PerformancePanel').then(m => ({ default: m.PerformancePanel })))
const DashboardPreferencesPanel = lazy(() => import('./components/DashboardPreferencesPanel').then(m => ({ default: m.DashboardPreferencesPanel })))
const EquipmentDiagnostics = lazy(() => import('./components/EquipmentDiagnostics').then(m => ({ default: m.EquipmentDiagnostics })))
const KnowledgeCoachPanel = lazy(() => import('./components/KnowledgeCoachPanel').then(m => ({ default: m.KnowledgeCoachPanel })))
const PluginManagerPanel = lazy(() => import('./components/PluginManagerPanel').then(m => ({ default: m.PluginManagerPanel })))
const AudioControlPanel = lazy(() => import('./components/AudioControlPanel').then(m => ({ default: m.AudioControlPanel })))
const UvFanControlPanel = lazy(() => import('./components/UvFanControlPanel').then(m => ({ default: m.UvFanControlPanel })))
const CameraMonitorPanel = lazy(() => import('./components/CameraMonitorPanel').then(m => ({ default: m.CameraMonitorPanel })))
const FeederControlPanel = lazy(() => import('./components/FeederControlPanel').then(m => ({ default: m.FeederControlPanel })))
const HydrationControlPanel = lazy(() => import('./components/HydrationControlPanel').then(m => ({ default: m.HydrationControlPanel })))

const NotificationTroubleshooter = lazy(() =>
  import('./components/NotificationTroubleshooter').then((module) => ({
    default: module.NotificationTroubleshooter,
  })),
)

const MemoryPanel = lazy(() =>
  import('./components/MemoryPanel').then((module) => ({
    default: module.MemoryPanel,
  })),
)

const MemoryKeywordCloud = lazy(() =>
  import('./components/MemoryKeywordCloud').then((module) => ({
    default: module.MemoryKeywordCloud,
  })),
)

const ENABLE_MOCKS =
  (import.meta.env.VITE_ENABLE_MOCKS ?? 'false').toString().toLowerCase() === 'true'

const EQUIPMENT_DIAGNOSTICS_ENABLED =
  (import.meta.env.VITE_ENABLE_EQUIPMENT_DIAGNOSTICS ?? 'false').toString().toLowerCase() === 'true'

const NOTIFICATION_HELP_URL = 'https://github.com/meaqua/smart-cat-home/wiki/Notifications'
const THEME_STORAGE_KEY = 'smartCatHome.theme'
const MANUAL_THEME_OPTIONS = [
  { code: 'morning', labelKey: 'settings.theme.morning' },
  { code: 'evening', labelKey: 'settings.theme.evening' },
  { code: 'night', labelKey: 'settings.theme.night' },
] as const

const THEME_OPTIONS = [
  { code: 'auto', labelKey: 'settings.theme.auto' },
  ...MANUAL_THEME_OPTIONS,
] as const

const HEALTH_POLL_INTERVAL_MS = (() => {
  const raw = import.meta.env.VITE_BACKEND_HEALTH_POLL_MS
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(parsed) && parsed >= 5000) {
    return parsed
  }
  return 60000
})()

const SPARKLINE_LIMIT = 16

type ThemeOption = (typeof THEME_OPTIONS)[number]['code']
const AUTO_THEME_UPDATE_INTERVAL_MS = 60_000
const FALLBACK_THEME: ManualTheme = 'morning'
const THEME_LABEL_KEY_MAP: Record<ManualTheme, TranslationKey> = {
  morning: 'settings.theme.morning',
  evening: 'settings.theme.evening',
  night: 'settings.theme.night',
}
const LEGACY_THEME_MAP: Record<string, ThemeOption> = {
  light: 'morning',
  dark: 'night',
  forest: 'evening',
}
const IDEAL_BRIGHTNESS = 60

const EPOCH_THRESHOLD = 10 ** 12

type LocalizedHardwareProfile = {
  id: string
  name: string
  descriptionZh: string
  descriptionEn: string
}

const DEFAULT_HARDWARE_PROFILES: LocalizedHardwareProfile[] = [
  {
    id: 'smart-cat-home',
    name: 'Smart Cat Home',
    descriptionZh: '智慧寵物家居：優化溫濕度、飲水與作息管理。',
    descriptionEn: 'Smart cat home: optimize temperature, hydration, and litter box routines.',
  },
  {
    id: 'smart-dog-home',
    name: 'Smart Dog Home',
    descriptionZh: '犬舍空氣流通、活動雷達與餵食安全鎖，專為狗狗調校。',
    descriptionEn: 'Dog home with airflow, activity radar, and feeder safety locks.',
  },
  {
    id: 'smart-bird-home',
    name: 'Smart Bird Home',
    descriptionZh: '棲木重量、環境光與 UV 殺菌，適用鳥類棲地。',
    descriptionEn: 'Bird habitat: perch weight, ambient light, and UV sanitation ready.',
  },
]

const CUSTOM_HARDWARE_STORAGE_KEY = 'smartCatHome.customHardwareProfiles'
const ACTIVE_HARDWARE_PROFILE_KEY = 'smartCatHome.activeHardwareProfileId'

function formatTimestampLocal(value: string | undefined): string {
  if (!value) {
    return new Date().toLocaleString()
  }
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && numeric > 0) {
    const milliseconds = numeric < EPOCH_THRESHOLD ? numeric * 1000 : numeric
    const epochDate = new Date(milliseconds)
    if (!Number.isNaN(epochDate.getTime())) {
      return epochDate.toLocaleString()
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString()
  }
  return date.toLocaleString()
}

function slugifyProfileId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized : `custom-${Date.now()}`
}

function loadStoredCustomProfiles(): HardwareProfile[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_HARDWARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HardwareProfile[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((profile) => ({
        id: slugifyProfileId(profile.id ?? profile.name ?? `custom-${Date.now()}`),
        name: profile.name || profile.id || 'Custom hardware',
        description: profile.description,
        icon: profile.icon,
      }))
      .slice(0, 12)
  } catch {
    return []
  }
}

function AuthenticatedApp({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }) {
  const iconUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL ?? '/'
    const normalized = base.endsWith('/') ? base : `${base}/`
    return `${normalized}purrfect-icon.png`
  }, [])

  const {
    cats,
    activeCatId,
    loading: catsLoading,
    error: catsError,
    addCat,
    editCat,
    selectCat,
  } = useCats()

  const {
    snapshot,
    history,
    settings,
    loading,
    error,
    refresh,
    updateSettings,
    validationWarnings,
    realtimeStatus,
  } = useSmartHomeData(activeCatId)

  const { t, language, setLanguage, options } = useLanguage()
  const aiSuitePlaceholderTitle = language === 'zh' ? 'AI 面板暫緩載入' : 'AI suite paused'
  const aiSuitePlaceholderBody =
    language === 'zh'
      ? '為了加快開啟速度，AI 面板會在你需要時才載入。點一下按鈕或向下捲動即可開始。'
      : 'To keep the dashboard snappy, the AI tools now load only when you need them. Click below or scroll into view to start.'
  const aiSuitePlaceholderCta = language === 'zh' ? '立即載入 AI 面板' : 'Load AI tools'
  const insightsPlaceholderTitle =
    language === 'zh' ? '趨勢分析尚未載入' : 'Insights paused'
  const insightsPlaceholderBody =
    language === 'zh'
      ? '這些趨勢與分析會在你捲動到此區塊或手動啟用時才抓取資料。'
      : 'Trend and insight data loads once this section is visible or you enable it manually.'
  const insightsPlaceholderCta = language === 'zh' ? '讀取趨勢資料' : 'Load insight data'
  const isDeveloper = user.role === 'developer'
  const roleLabel = useMemo(
    () => t(isDeveloper ? 'auth.role.developer' : 'auth.role.user'),
    [t, isDeveloper],
  )
  const { alerts } = useAutomationAlerts({ disabled: !API_BASE_URL })
  const {
    health: backendHealth,
    loading: healthLoading,
    refresh: refreshHealth,
    effectiveIntervalMs,
    consecutiveErrors: backendErrorStreak,
  } = useBackendHealth({ disabled: !API_BASE_URL, pollIntervalMs: HEALTH_POLL_INTERVAL_MS })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showNotificationWizard, setShowNotificationWizard] = useState(false)
  const {
    items: memories,
    loading: memoriesLoading,
    add: addMemoryEntry,
    update: updateMemoryEntry,
    remove: deleteMemoryEntry,
    refresh: refreshMemories,
  } = useMemories({ disabled: !API_BASE_URL || !isDeveloper })
  const {
    rules: alertRules,
    loading: alertRulesLoading,
    create: createAlertRuleEntry,
    update: updateAlertRuleEntry,
    remove: removeAlertRuleEntry,
  } = useAlertRules({ disabled: !API_BASE_URL })
  const {
    profiles: petProfiles,
    currentProfile: currentPetProfile,
    loading: petProfilesLoading,
    switchProfile: switchPetProfile,
    refresh: refreshPetProfiles,
  } = usePetProfile({ disabled: !API_BASE_URL })
  const petKindLabel = useMemo(() => {
    if (currentPetProfile?.customLabel) return currentPetProfile.customLabel
    const map =
      language === 'zh'
        ? { cat: '貓咪', dog: '狗狗', bird: '鳥類', custom: '寵物' }
        : { cat: 'cat', dog: 'dog', bird: 'bird', custom: 'pet' }
    return currentPetProfile ? map[currentPetProfile.type] ?? map.custom : map.custom
  }, [currentPetProfile, language])
  const heroSubtitle = useMemo(
    () =>
      language === 'zh'
        ? `連結智慧${petKindLabel}屋，隨時掌握環境。`
        : `Monitor your ${petKindLabel}'s habitat anytime.`,
    [language, petKindLabel],
  )
  const envDescription = useMemo(
    () =>
      language === 'zh'
        ? `智慧${petKindLabel}屋：優化溫濕度、飲水與作息。`
        : `Optimized for ${petKindLabel} comfort: temperature, hydration and routines.`,
    [language, petKindLabel],
  )
  const {
    keywords: memoryKeywords,
    loading: memoryKeywordsLoading,
    refresh: refreshMemoryKeywords,
  } = useMemoryKeywords({ disabled: !API_BASE_URL || !isDeveloper, limit: 20 })
  const {
    items: chatFavorites,
    loading: chatFavoritesLoading,
    add: addChatFavoriteEntry,
    remove: removeChatFavoriteEntry,
    refresh: refreshChatFavorites,
  } = useChatFavorites({ disabled: !API_BASE_URL })
  const {
    ref: insightsRef,
    active: insightsAutoActive,
    activate: activateInsights,
  } = useDeferredActivation<HTMLElement>({
    rootMargin: '200px 0px',
    threshold: 0.25,
  })
  const [insightsManualActive, setInsightsManualActive] = useState(false)
  const insightsEnabled = Boolean(API_BASE_URL) && (insightsManualActive || insightsAutoActive)

  const [customHardwareProfiles, setCustomHardwareProfiles] = useState<HardwareProfile[]>(() => loadStoredCustomProfiles())
  const hardwareProfiles = useMemo(() => {
    const merged = new Map<string, HardwareProfile>()
    DEFAULT_HARDWARE_PROFILES.forEach((profile) =>
      merged.set(profile.id, {
        id: profile.id,
        name: profile.name,
        description: language === 'zh' ? profile.descriptionZh : profile.descriptionEn,
      }),
    )
    customHardwareProfiles.forEach((profile) => merged.set(profile.id, profile))
    return Array.from(merged.values())
  }, [customHardwareProfiles, language])

  const [activeHardwareProfileId, setActiveHardwareProfileId] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_HARDWARE_PROFILES[0]?.id ?? ''
    }
    return window.localStorage.getItem(ACTIVE_HARDWARE_PROFILE_KEY) ?? DEFAULT_HARDWARE_PROFILES[0]?.id ?? ''
  })

  const activeHardwareProfile = useMemo(
    () => hardwareProfiles.find((profile) => profile.id === activeHardwareProfileId) ?? hardwareProfiles[0] ?? null,
    [hardwareProfiles, activeHardwareProfileId],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(CUSTOM_HARDWARE_STORAGE_KEY, JSON.stringify(customHardwareProfiles))
  }, [customHardwareProfiles])

  useEffect(() => {
    if (!hardwareProfiles.length) return
    if (!hardwareProfiles.some((profile) => profile.id === activeHardwareProfileId)) {
      setActiveHardwareProfileId(hardwareProfiles[0].id)
    }
  }, [hardwareProfiles, activeHardwareProfileId])

  useEffect(() => {
    if (!activeHardwareProfile) {
      setHardwareProfileHeader(null)
      return
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_HARDWARE_PROFILE_KEY, activeHardwareProfile.id)
    }
    setHardwareProfileHeader({ id: activeHardwareProfile.id, label: activeHardwareProfile.name })
  }, [activeHardwareProfile])

  const brandTitle = useMemo(() => activeHardwareProfile?.name ?? t('app.title'), [activeHardwareProfile, t])
  const brandSubtitle = useMemo(
    () => activeHardwareProfile?.description ?? heroSubtitle,
    [activeHardwareProfile, heroSubtitle],
  )

  const handleHardwareProfileSelect = useCallback((profileId: string) => {
    setActiveHardwareProfileId(profileId)
  }, [])

  const handleAddCustomHardwareProfile = useCallback(() => {
    const namePrompt = language === 'zh' ? '輸入硬件名稱（例如 Smart Hamster Home）' : 'Enter hardware name (e.g. Smart Hamster Home)'
    const nameInput = window.prompt(namePrompt)
    if (!nameInput) {
      return
    }
    const trimmedName = nameInput.trim()
    if (!trimmedName) {
      return
    }
    const descriptionPrompt =
      language === 'zh'
        ? '輸入描述（可留空，例如：夜行性、需常換空氣）'
        : 'Enter a short description (optional, e.g. nocturnal airflow requirements)'
    const descriptionInput = window.prompt(descriptionPrompt ?? '') ?? ''
    const id = slugifyProfileId(trimmedName)
    setCustomHardwareProfiles((current) => {
      const filtered = current.filter((profile) => profile.id !== id)
      return [...filtered, { id, name: trimmedName, description: descriptionInput.trim() || undefined }]
    })
    setActiveHardwareProfileId(id)
  }, [language])

  const handleEnableInsights = useCallback(() => {
    setInsightsManualActive(true)
    activateInsights()
  }, [activateInsights])

  const {
    generatedAt: insightsGeneratedAt,
    sampleCount: insightsSampleCount,
    insights: careInsights,
    loading: careInsightsLoading,
    error: careInsightsError,
    refresh: refreshCareInsights,
  } = useCareInsights({ disabled: !API_BASE_URL, catId: activeCatId, language })
  const {
    forecast: behaviorForecast,
    loading: behaviorForecastLoading,
    error: behaviorForecastError,
    refresh: refreshBehaviorForecast,
  } = useBehaviorForecast({ disabled: !API_BASE_URL || !insightsEnabled, catId: activeCatId, language })
  const {
    profile: behaviorProfile,
    loading: behaviorProfileLoading,
    error: behaviorProfileError,
    refresh: refreshBehaviorProfile,
  } = useBehaviorProfile({ disabled: !API_BASE_URL || !insightsEnabled, catId: activeCatId })
  const {
    pending: pendingCareTasks,
    completed: completedCareTasks,
    loading: careTasksLoading,
    error: careTasksError,
    addTask: addCareTask,
    setStatus: setCareTaskStatus,
    removeTask: removeCareTask,
    generateSuggestions: generateCareTaskSuggestions,
    refresh: refreshCareTasks,
  } = useCareTasks({ disabled: !API_BASE_URL })
  const [insightTaskBusyId, setInsightTaskBusyId] = useState<string | null>(null)
  const [insightTaskNotice, setInsightTaskNotice] = useState<{
    variant: 'success' | 'error'
    message: string
  } | null>(null)
  const {
    plugins: carePlugins,
    loading: carePluginsLoading,
    error: carePluginsError,
    refresh: refreshCarePlugins,
    toggle: toggleCarePlugin,
    remove: removeCarePlugin,
    register: registerCarePlugin,
  } = useCarePlugins({ disabled: !API_BASE_URL || !isDeveloper })
  const {
    layout: dashboardLayout,
    loading: layoutLoading,
    saving: layoutSaving,
    error: layoutError,
    update: updateDashboardLayout,
    reset: resetDashboardLayout,
  } = useDashboardLayout({ disabled: !API_BASE_URL })
  const {
    ref: aiSuiteRef,
    active: aiSuiteAutoActive,
    activate: activateAiSuite,
  } = useDeferredActivation<HTMLElement>({
    rootMargin: '200px 0px',
    threshold: 0.25,
  })
  const [aiSuiteManualActive, setAiSuiteManualActive] = useState(false)
  const aiSuiteActivated = aiSuiteManualActive || aiSuiteAutoActive
  const handleEnableAiSuite = useCallback(() => {
    setAiSuiteManualActive(true)
    activateAiSuite()
  }, [activateAiSuite])
  useEffect(() => {
    if (aiSuiteManualActive || aiSuiteAutoActive || typeof window === 'undefined') {
      return undefined
    }

    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const activateSoon = () => {
      setAiSuiteManualActive((prev) => {
        if (prev) {
          return prev
        }
        activateAiSuite()
        return true
      })
    }

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const handle = idleWindow.requestIdleCallback(
        () => activateSoon(),
        { timeout: 2000 },
      )
      return () => {
        idleWindow.cancelIdleCallback?.(handle)
      }
    }

    const timeoutId = window.setTimeout(activateSoon, 1200)
    return () => window.clearTimeout(timeoutId)
  }, [aiSuiteManualActive, aiSuiteAutoActive, activateAiSuite])
  const [pinningHighlight, setPinningHighlight] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const handleCreateTaskFromInsight = useCallback(
    async (insight: CareInsight) => {
      if (!API_BASE_URL || !insight.followUpTask) return
      setInsightTaskNotice(null)
      setInsightTaskBusyId(insight.id)
      try {
        const metadata: Record<string, unknown> = {
          ...(insight.followUpTask.metadata ?? {}),
          sourceInsightId: insight.id,
          sourceInsightSeverity: insight.severity,
        }
        if (insight.followUpTask.urgency) {
          metadata.urgency = insight.followUpTask.urgency
        }
        await addCareTask({
          title: insight.followUpTask.title,
          description: insight.followUpTask.description,
          category: insight.followUpTask.category,
          dueAt: insight.followUpTask.dueAt,
          metadata,
        })
        const successMessage = t('careInsights.taskCreatedSuccess', { title: insight.followUpTask.title })
        setInsightTaskNotice({
          variant: 'success',
          message: successMessage,
        })
        setTimeout(() => {
          setInsightTaskNotice((prev) => (prev?.message === successMessage ? null : prev))
        }, 4000)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const errorMessage = t('careInsights.taskCreatedError', { message })
        setInsightTaskNotice({
          variant: 'error',
          message: errorMessage,
        })
        setTimeout(() => {
          setInsightTaskNotice((prev) => (prev?.message === errorMessage ? null : prev))
        }, 6000)
      } finally {
        setInsightTaskBusyId(null)
      }
    },
    [addCareTask, t],
  )
  const panelDefinitions = useMemo(
    () => [
      { id: 'care-insights', label: t('dashboard.panels.careInsights'), group: 'insights' as const, reorderable: true },
      { id: 'behavior-forecast', label: t('dashboard.panels.behaviorForecast'), group: 'insights' as const, reorderable: true },
      { id: 'behavior-profile', label: t('dashboard.panels.behaviorProfile'), group: 'insights' as const, reorderable: true },
      { id: 'care-tasks', label: t('dashboard.panels.careTasks'), group: 'tasks' as const },
      { id: 'ai-suite', label: t('dashboard.panels.aiSuite'), group: 'ai' as const },
    ],
    [t],
  )

  const hiddenPanelSet = useMemo(() => new Set(dashboardLayout.hiddenPanels), [dashboardLayout.hiddenPanels])
  const hasVisibleInsightPanels = useMemo(
    () => ['care-insights', 'behavior-forecast', 'behavior-profile'].some((panelId) => !hiddenPanelSet.has(panelId)),
    [hiddenPanelSet],
  )

  const isPanelHidden = useCallback((panelId: string) => hiddenPanelSet.has(panelId), [hiddenPanelSet])

  const handleTogglePanel = useCallback(
    (panelId: string, hide: boolean) => {
      const nextHidden = new Set(hiddenPanelSet)
      if (hide) {
        nextHidden.add(panelId)
      } else {
        nextHidden.delete(panelId)
      }
      void updateDashboardLayout({ hiddenPanels: Array.from(nextHidden) }).catch(() => undefined)
    },
    [hiddenPanelSet, updateDashboardLayout],
  )

  const handleMovePanel = useCallback(
    (panelId: string, direction: 'up' | 'down') => {
      const order = [...dashboardLayout.panelOrder]
      const index = order.indexOf(panelId)
      if (index === -1) return
      const targetIndex = direction === 'up' ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1)
      if (index === targetIndex) return
      const nextOrder = [...order]
      const [item] = nextOrder.splice(index, 1)
      nextOrder.splice(targetIndex, 0, item)
      void updateDashboardLayout({ panelOrder: nextOrder }).catch(() => undefined)
    },
    [dashboardLayout.panelOrder, updateDashboardLayout],
  )

  const handleResetPanels = useCallback(() => {
    void resetDashboardLayout().catch(() => undefined)
  }, [resetDashboardLayout])
  const [theme, setTheme] = useState<ThemeOption>(() => {
    if (typeof window === 'undefined') return 'auto'
    const storedRaw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedRaw) {
      if (THEME_OPTIONS.some((option) => option.code === storedRaw)) {
        return storedRaw as ThemeOption
      }
      if (storedRaw in LEGACY_THEME_MAP) {
        return LEGACY_THEME_MAP[storedRaw]
      }
    }
    return 'auto'
  })
  const [autoTheme, setAutoTheme] = useState<ManualTheme>(() => {
    if (typeof window === 'undefined') return FALLBACK_THEME
    return getTimeBasedTheme()
  })

  const insightPanelNodes = useMemo(
    () =>
      insightsEnabled
        ? dashboardLayout.panelOrder
            .map((panelId) => {
              if (isPanelHidden(panelId)) return null
              switch (panelId) {
                case 'care-insights':
                  return (
                    <Fragment key="care-insights">
                      {careInsightsError ? <InlineNotice variant="error" message={careInsightsError} /> : null}
                      <Suspense fallback={<Loader />}>
                        <CareInsightsPanel
                          insights={careInsights}
                          loading={careInsightsLoading}
                          generatedAt={insightsGeneratedAt}
                          sampleCount={insightsSampleCount}
                          onRefresh={refreshCareInsights}
                          onCreateTask={API_BASE_URL ? handleCreateTaskFromInsight : undefined}
                          creatingId={insightTaskBusyId}
                          notice={insightTaskNotice}
                        />
                      </Suspense>
                    </Fragment>
                  )
                case 'behavior-forecast':
                  return (
                    <Fragment key="behavior-forecast">
                      {behaviorForecastError ? <InlineNotice variant="error" message={behaviorForecastError} /> : null}
                      <Suspense fallback={<Loader />}>
                        <BehaviorForecastCard
                          forecast={behaviorForecast}
                          loading={behaviorForecastLoading}
                          onRefresh={refreshBehaviorForecast}
                        />
                      </Suspense>
                    </Fragment>
                  )
                case 'behavior-profile':
                  return (
                    <Suspense key="behavior-profile" fallback={<Loader />}>
                      <BehaviorProfileCard
                        profile={behaviorProfile}
                        loading={behaviorProfileLoading}
                        error={behaviorProfileError}
                        onRefresh={refreshBehaviorProfile}
                      />
                    </Suspense>
                  )
                default:
                  return null
              }
            })
            .filter((node): node is JSX.Element => node !== null)
        : [],
    [
      insightsEnabled,
      dashboardLayout.panelOrder,
      isPanelHidden,
      careInsightsError,
      careInsights,
      careInsightsLoading,
      insightsGeneratedAt,
      insightsSampleCount,
      refreshCareInsights,
      handleCreateTaskFromInsight,
      insightTaskBusyId,
      insightTaskNotice,
      behaviorForecastError,
      behaviorForecast,
      behaviorForecastLoading,
      refreshBehaviorForecast,
      behaviorProfile,
      behaviorProfileLoading,
      behaviorProfileError,
      refreshBehaviorProfile,
    ],
  )

  const showInsightsSection = Boolean(API_BASE_URL) && hasVisibleInsightPanels
  const showCareTasksSection = API_BASE_URL && !isPanelHidden('care-tasks')
  const showAiSuite = !isPanelHidden('ai-suite')
  const aiSuiteEnabled = showAiSuite && aiSuiteActivated
  const appliedTheme: ManualTheme = theme === 'auto' ? autoTheme : theme
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const advancedContentRef = useRef<HTMLDivElement | null>(null)
  const [lastAlertSignature, setLastAlertSignature] = useState<string | null>(null)
  const [controlSuggestion, setControlSuggestion] = useState<{
    id: string
    settings: Partial<SmartHomeSettings>
    message: string
  } | null>(null)

  const [notificationStatus, setNotificationStatus] = useState<
    'idle' | 'enabled' | 'denied' | 'error'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied'
    }
    const permission = window.Notification.permission
    if (permission === 'granted') {
      return 'enabled'
    }
    if (permission === 'denied') {
      return 'denied'
    }
    return 'idle'
  })

  const [notificationKey, setNotificationKey] = useState<TranslationKey | null>(
    null,
  )
  const [notificationFallback, setNotificationFallback] = useState<string | null>(
    null,
  )

  const backendStatusDescriptor = useMemo(() => {
    const normalized = (backendHealth.status ?? '').toLowerCase()
    if (normalized === 'healthy') {
      return {
        labelKey: 'app.backend.healthy' as TranslationKey,
        className: 'status-pill status-pill--ok',
      }
    }
    if (['warning', 'degraded', 'slow'].includes(normalized)) {
      return {
        labelKey: 'app.backend.degraded' as TranslationKey,
        className: 'status-pill status-pill--warn',
      }
    }
    if (['offline', 'error', 'failed', 'unreachable'].includes(normalized)) {
      return {
        labelKey: 'app.backend.offline' as TranslationKey,
        className: 'status-pill status-pill--critical',
      }
    }
    if (['maintenance', 'updating'].includes(normalized)) {
      return {
        labelKey: 'app.backend.maintenance' as TranslationKey,
        className: 'status-pill status-pill--info',
      }
    }
    return {
      labelKey: 'app.backend.unknown' as TranslationKey,
      className: 'status-pill status-pill--neutral',
    }
  }, [backendHealth.status])
  const backendStatusLabel = t(backendStatusDescriptor.labelKey)
  const backendStatusClass = backendStatusDescriptor.className
  const effectiveIntervalSeconds = Math.max(1, Math.round(effectiveIntervalMs / 1000))
  const refreshAutoLabel = useMemo(
    () => t('app.refresh.auto', { seconds: effectiveIntervalSeconds }),
    [t, effectiveIntervalSeconds],
  )
  const backendRecoveringLabel = useMemo(
    () =>
      backendErrorStreak > 0
        ? t('app.refresh.recovering', { count: backendErrorStreak })
        : null,
    [backendErrorStreak, t],
  )
  const combinedRefreshLoading = loading || healthLoading
  const notificationButtonLabel =
    notificationStatus === 'enabled'
      ? language === 'zh'
        ? '重新設定通知'
        : 'Reconfigure Notifications'
      : t('app.notifications.enable')
  const notificationButtonTooltip =
    notificationStatus === 'enabled'
      ? language === 'zh'
        ? '通知已啟用，點擊可重新註冊或重置推播授權'
        : 'Notifications enabled; click to re-register or reset permissions'
      : undefined
  const showEmptyOverview = !loading && !snapshot && history.length === 0
  const handleRefreshAll = useCallback(() => {
    void refresh()
    void refreshHealth()
  }, [refresh, refreshHealth])

  const handleLogout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await onLogout()
    } finally {
      setLoggingOut(false)
    }
  }, [loggingOut, onLogout])

  useEffect(() => {
    if (!notificationKey) return undefined
    if (notificationKey === 'notifications.success' || notificationKey === 'notifications.testDispatched') {
      const timer = setTimeout(() => {
        setNotificationKey(null)
        setNotificationFallback(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [notificationKey])

  useEffect(() => {
    if (!pinError) return undefined
    const timer = window.setTimeout(() => {
      setPinError(null)
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [pinError])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (theme !== 'auto') {
      setAutoTheme(getTimeBasedTheme())
      return undefined
    }
    const updateAutoTheme = () => {
      setAutoTheme((current: ManualTheme) => {
        const next = getTimeBasedTheme()
        return current === next ? current : next
      })
    }
    updateAutoTheme()
    const intervalId = window.setInterval(updateAutoTheme, AUTO_THEME_UPDATE_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [theme])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.documentElement.setAttribute('data-theme', appliedTheme)
    return undefined
  }, [appliedTheme])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    return undefined
  }, [theme])

  useEffect(() => {
    if (!API_BASE_URL || !activeCatId) {
      return
    }
    const syncForCat = async () => {
      await refresh()
      refreshCareInsights()
      refreshBehaviorForecast()
      refreshCareTasks()
      refreshHealth()
    }
    void syncForCat()
  }, [activeCatId, refresh, refreshCareInsights, refreshBehaviorForecast, refreshCareTasks, refreshHealth])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 480)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  useEffect(() => {
    if (!showAdvanced) return undefined
    if (typeof window === 'undefined') return undefined
    const id = window.requestAnimationFrame(() => {
      advancedContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [showAdvanced])

  const insights = useMemo(() => generateInsights(snapshot, t), [snapshot, t])
  const aiSummary = useMemo(
    () =>
      buildAiSummary({
        snapshot: snapshot ?? null,
        settings,
        insights,
        history,
        translate: (key, params) => t(key, params as never),
      }),
    [snapshot, settings, insights, history, t],
  )
  const isMockMode = !API_BASE_URL && ENABLE_MOCKS
  const sectionAnchors = useMemo(() => {
    const anchors: Array<{ id: string; label: string }> = [
      { id: 'section-realtime', label: t('hero.anchor.realtime') },
      { id: 'section-care', label: t('hero.anchor.care') },
    ]

    if (API_BASE_URL) {
      anchors.push(
        { id: 'section-insights', label: t('hero.anchor.insights') },
        { id: 'section-tasks', label: t('hero.anchor.tasks') },
      )
    }

    anchors.push(
      { id: 'section-control', label: t('hero.anchor.control') },
      { id: 'section-ai', label: t('hero.anchor.ai') },
      { id: 'section-alerts', label: t('hero.anchor.alerts') },
    )

    if (API_BASE_URL && isDeveloper) {
      anchors.push(
        { id: 'section-memory', label: t('hero.anchor.memory') },
        { id: 'section-plugins', label: t('hero.anchor.plugins') },
      )
    }

    return anchors
  }, [t, isDeveloper])

  const scrollToSection = useCallback((id: string) => {
    if (typeof document === 'undefined') return
    const section = document.getElementById(id)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const mobileNavItems = useMemo(
    () => [
      { id: 'section-overview', label: t('hero.anchor.realtime'), icon: '🏠' },
      { id: 'section-care', label: t('hero.anchor.care'), icon: '💧' },
      { id: 'section-insights', label: t('hero.anchor.insights'), icon: '📊' },
      { id: 'section-tasks', label: t('hero.anchor.tasks'), icon: '✅' },
      { id: 'section-control', label: t('hero.anchor.control'), icon: '⚙️' },
      { id: 'section-ai', label: t('hero.anchor.ai'), icon: '🤖' },
      { id: 'section-alerts', label: t('hero.anchor.alerts'), icon: '🚨' },
    ],
    [t],
  )

  const validationMessages = useMemo(
    () =>
      validationWarnings.map((warning, index) => {
        const params: Record<string, string | number> = warning.params
          ? { ...warning.params }
          : {}
        if (warning.labelKey) {
          params.label = t(warning.labelKey)
        }
        return {
          id: `${warning.key}-${index}`,
          message: t(warning.key, params as never),
        }
      }),
    [t, validationWarnings],
  )

  const handleApplyRecommendation = useCallback(
    (recommendation: AIInsightRecommendation) => {
      if (recommendation.kind !== 'setting') return
      const suggestionSettings = {
        [recommendation.key]: recommendation.value,
      } as Partial<SmartHomeSettings>
      if (recommendation.key !== 'autoMode') {
        suggestionSettings.autoMode = false
      }
      setControlSuggestion({
        id: `${recommendation.key}-${Date.now()}`,
        settings: suggestionSettings,
        message:
          recommendation.description ??
          t('control.suggestion.applied', { label: recommendation.label }),
      })
    },
    [t],
  )

  const pinnedHighlights = useMemo(
    () => (backendHealth.pinnedToolEvents ?? []).map((event) => event.timestamp),
    [backendHealth.pinnedToolEvents],
  )

  const highlightEvents = useMemo(() => {
    const pinnedEvents = backendHealth.pinnedToolEvents ?? []
    const pinnedSet = new Set(pinnedEvents.map((event) => event.timestamp))
    const recentEvents = backendHealth.toolEvents ?? []
    const dedupedRecent = recentEvents.filter((event) => !pinnedSet.has(event.timestamp))
    return [...pinnedEvents, ...dedupedRecent]
  }, [backendHealth.pinnedToolEvents, backendHealth.toolEvents])

  const pinErrorMessage = useMemo(() => {
    if (!pinError) return null
    return t('aiHighlights.pinError', { message: pinError })
  }, [pinError, t])

  const lastUpdatedValue = snapshot ? formatTimestampLocal(snapshot.reading.timestamp) : t('app.noUpdate')
  const uvFanStatusUpdatedAt = useMemo(() => {
    if (!snapshot?.reading) {
      return null
    }
    if (typeof snapshot.reading.timestampMs === 'number' && Number.isFinite(snapshot.reading.timestampMs)) {
      return snapshot.reading.timestampMs
    }
    if (typeof snapshot.reading.timestampUnix === 'number' && Number.isFinite(snapshot.reading.timestampUnix)) {
      return snapshot.reading.timestampUnix * 1000
    }
    const isoSource = snapshot.reading.timestampIso ?? snapshot.reading.timestamp
    if (typeof isoSource === 'string' && isoSource.trim().length > 0) {
      const parsed = Date.parse(isoSource)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
    return Date.now()
  }, [
    snapshot?.reading,
    snapshot?.reading.timestamp,
    snapshot?.reading.timestampIso,
    snapshot?.reading.timestampMs,
    snapshot?.reading.timestampUnix,
  ])
  const feederStatusVersion = uvFanStatusUpdatedAt
  const hydrationStatusVersion = uvFanStatusUpdatedAt
  const lastUpdatedLabel = useMemo(
    () => t('app.lastUpdated', { time: lastUpdatedValue }),
    [lastUpdatedValue, t],
  )

  const isNativePush = isNativePushEnvironment()

  const enableNotifications = async () => {
    const workerResult = await pushNotificationWorker(language)
    if (!workerResult.ok) {
      if (workerResult.permission === 'denied') {
        setNotificationStatus('denied')
      } else {
        setNotificationStatus('error')
      }

      if (workerResult.messageKey) {
        setNotificationKey(workerResult.messageKey)
        setNotificationFallback(null)
      } else if (workerResult.message) {
        setNotificationKey(null)
        setNotificationFallback(workerResult.message)
      } else if (workerResult.permission === 'denied') {
        setNotificationKey('notifications.denied')
        setNotificationFallback(null)
      } else {
        setNotificationKey('notifications.error')
        setNotificationFallback(null)
      }
      return
    }

    const subscriptionResult = isNativePush
      ? await ensureNativePushRegistration(language)
      : await ensurePushSubscription(language)
    if (!subscriptionResult.ok) {
      setNotificationStatus('error')
      if (subscriptionResult.messageKey) {
        setNotificationKey(subscriptionResult.messageKey)
        setNotificationFallback(subscriptionResult.message ?? null)
      } else if (subscriptionResult.message) {
        setNotificationKey(null)
        setNotificationFallback(subscriptionResult.message)
      } else {
        setNotificationKey('notifications.error')
        setNotificationFallback(null)
      }
      return
    }

    setNotificationStatus('enabled')
    setNotificationKey('notifications.success')
    setNotificationFallback(null)
  }

  const triggerTestNotification = async () => {
    const result = await sendTestNotification(language)
    if (!result.ok) {
      setNotificationStatus('error')
      if (result.messageKey) {
        setNotificationKey(result.messageKey)
        setNotificationFallback(result.message ?? null)
      } else if (result.message) {
        setNotificationKey(null)
        setNotificationFallback(result.message)
      } else {
        setNotificationKey('notifications.error')
        setNotificationFallback(null)
      }
      return
    }

    setNotificationKey('notifications.testDispatched')
    setNotificationFallback(null)
  }

  const handleToggleHighlightPin = useCallback(
    async (event: ToolEventSummary) => {
      if (!API_BASE_URL || !isDeveloper) return
      if (pinningHighlight === event.timestamp) {
        return
      }
      setPinError(null)
      const timestamp = event.timestamp
      setPinningHighlight(timestamp)
      try {
        if (pinnedHighlights.includes(timestamp)) {
          await unpinToolEventSummary(timestamp)
        } else {
          await pinToolEventSummary(event)
        }
        await refreshHealth()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPinError(message)
      } finally {
        setPinningHighlight(null)
      }
    },
    [pinningHighlight, pinnedHighlights, refreshHealth, isDeveloper],
  )

  const updateLanguage = (next: Language) => {
    setLanguage(next)
    setSettingsOpen(false)
  }

  const updateTheme = (next: ThemeOption) => {
    setTheme(next)
    setSettingsOpen(false)
  }

  const handleNavigate = useCallback((id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const goToInsights = useCallback(() => {
    handleNavigate('section-insights')
  }, [handleNavigate])

  const goToTasks = useCallback(() => {
    handleNavigate('section-tasks')
  }, [handleNavigate])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleCreateAlertRule = useCallback(
    async (payload: Parameters<typeof createAlertRuleEntry>[0]) => {
      await createAlertRuleEntry(payload)
      await refreshHealth()
    },
    [createAlertRuleEntry, refreshHealth],
  )

  const handleUpdateAlertRule = useCallback(
    async (id: number, payload: Parameters<typeof updateAlertRuleEntry>[1]) => {
      await updateAlertRuleEntry(id, payload)
      await refreshHealth()
    },
    [updateAlertRuleEntry, refreshHealth],
  )

  const handleRemoveAlertRule = useCallback(
    async (id: number) => {
      await removeAlertRuleEntry(id)
      await refreshHealth()
    },
    [removeAlertRuleEntry, refreshHealth],
  )

  const backendOffline = API_BASE_URL && backendHealth.status !== 'healthy'
  const notificationMessageContent = useMemo(() => {
    if (notificationKey === 'notifications.enableInstructions') {
      return (
        <span>
          {t('notifications.enableInstructions')}{' '}
          <a href={NOTIFICATION_HELP_URL} target="_blank" rel="noreferrer">
            {t('notifications.helpLink')}
          </a>
        </span>
      )
    }
    if (notificationKey) {
      return t(notificationKey)
    }
    if (notificationFallback) {
      return notificationFallback
    }
    return null
  }, [notificationFallback, notificationKey, t])

  const locale = language === 'zh' ? 'zh-TW' : 'en-US'

  const statusLabels = useMemo(() => {
    const labels: Record<'normal' | 'warning' | 'critical', string> = {
      normal: t('data.status.normal'),
      warning: t('data.status.warning'),
      critical: t('data.status.critical'),
    }
    return labels
  }, [t])

  const temperatureHighlight = snapshot
    ? snapshot.reading.temperatureC >= 31
      ? 'critical'
      : snapshot.reading.temperatureC >= 28
        ? 'warning'
        : 'normal'
    : 'normal'

  const humidityHighlight = snapshot
    ? snapshot.reading.humidityPercent <= 30 || snapshot.reading.humidityPercent >= 65
      ? 'warning'
      : 'normal'
    : 'normal'

  const brightnessValue = snapshot?.reading.ambientLightPercent
  const brightnessHighlight =
    brightnessValue === undefined
      ? 'normal'
      : brightnessValue < 15 || brightnessValue > 85
        ? 'warning'
        : 'normal'

  const temperatureProgressLabel =
    snapshot && typeof snapshot.reading.temperatureC === 'number'
      ? t('data.temperature.progressLabel', {
          current: snapshot.reading.temperatureC.toFixed(1),
          target: settings.targetTemperatureC,
        })
      : undefined

  const humidityProgressLabel =
    snapshot && typeof snapshot.reading.humidityPercent === 'number'
      ? t('data.humidity.progressLabel', {
          current: Math.round(snapshot.reading.humidityPercent),
          target: settings.targetHumidityPercent,
        })
      : undefined

  const brightnessProgressLabel =
    typeof brightnessValue === 'number'
      ? t('data.brightness.progressLabel', {
          current: Math.round(brightnessValue),
          target: IDEAL_BRIGHTNESS,
        })
      : undefined

  const waterRemainingMl = snapshot
    ? Math.max(0, settings.waterBowlLevelTargetMl - snapshot.reading.waterIntakeMl)
    : null
  const waterConsumedMl = snapshot ? snapshot.reading.waterIntakeMl : null
  const waterHighlight =
    waterRemainingMl !== null && waterRemainingMl < settings.waterBowlLevelTargetMl * 0.2
      ? 'critical'
      : 'normal'

  const catPresent =
    snapshot?.reading.catPresent ??
    (snapshot ? snapshot.reading.catWeightKg >= 1 : false)
  const catPresenceHighlight = catPresent ? 'normal' : 'warning'

  const latestReading = snapshot?.reading ?? history[0]?.reading ?? null
  const previousReading = history.length > 1 ? history[1].reading : null

  const buildTrend = (
    current: number | undefined,
    previous: number | undefined,
    unit: string,
    digits = 1,
    threshold = 0.1,
  ) => {
    if (current === undefined || previous === undefined) {
      return undefined
    }
    const diff = current - previous
    const abs = Math.abs(diff)
    const direction =
      abs <= threshold ? ('stable' as const) : diff > 0 ? ('up' as const) : ('down' as const)
    const label =
      direction === 'stable'
        ? t('data.trend.steady')
        : t(
            direction === 'up' ? 'data.trend.increase' : 'data.trend.decrease',
            {
              value: abs.toLocaleString(locale, {
                maximumFractionDigits: digits,
                minimumFractionDigits: 0,
              }),
              unit,
            },
          )

    return {
      direction,
      label,
    }
  }

  const temperatureTrend = buildTrend(
    latestReading?.temperatureC,
    previousReading?.temperatureC,
    '°C',
    1,
    0.2,
  )
  const humidityTrend = buildTrend(
    latestReading?.humidityPercent,
    previousReading?.humidityPercent,
    '%',
    0,
    1,
  )
  const brightnessTrend = buildTrend(
    latestReading?.ambientLightPercent,
    previousReading?.ambientLightPercent,
    '%',
    0,
    3,
  )
  const waterTrend = buildTrend(
    latestReading?.waterIntakeMl,
    previousReading?.waterIntakeMl,
    'ml',
    0,
    5,
  )
  const weightTrend = buildTrend(
    latestReading?.catWeightKg,
    previousReading?.catWeightKg,
    'kg',
    2,
    0.05,
  )
  const airQualityTrend = buildTrend(
    latestReading?.airQualityIndex,
    previousReading?.airQualityIndex,
    'AQI',
    0,
    2,
  )
  const feedingUnit = language === 'zh' ? '分鐘' : 'min'
  const feedingTrend = buildTrend(
    latestReading?.lastFeedingMinutesAgo,
    previousReading?.lastFeedingMinutesAgo,
    feedingUnit,
    0,
    5,
  )

  const previousCatPresent = previousReading
    ? previousReading.catPresent ?? previousReading.catWeightKg >= 1
    : null
  const catPresenceTrend = useMemo(() => {
    if (previousCatPresent === null) {
      return undefined
    }
    if (catPresent === previousCatPresent) {
      return { direction: 'stable' as const, label: t('data.catPresence.noChange') }
    }
    return catPresent
      ? { direction: 'up' as const, label: t('data.catPresence.nowInside') }
      : { direction: 'down' as const, label: t('data.catPresence.justLeft') }
  }, [catPresent, previousCatPresent, t])

  const buildSparklineSeries = useCallback(
    (selector: (reading: SmartHomeSnapshot['reading']) => number | null | undefined) => {
      const values: number[] = []
      const pushValue = (value: number | null | undefined) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          values.push(value)
        }
      }
      if (snapshot?.reading) {
        pushValue(selector(snapshot.reading))
      }
      history.forEach((record) => {
        pushValue(selector(record.reading))
      })
      return values.slice(0, SPARKLINE_LIMIT)
    },
    [snapshot, history],
  )

  const sparklineSampleCount = Math.min(
    SPARKLINE_LIMIT,
    (snapshot ? 1 : 0) + history.length,
  )

  const quickVitalTargets = useMemo(
    () => ({
      temperature: 'section-realtime',
      humidity: 'section-realtime',
      water: 'section-care',
      light: 'section-realtime',
      cat: 'section-care',
    }),
    [],
  )

  const handleQuickVitalSelect = useCallback(
    (key: string) => {
      const target = quickVitalTargets[key as keyof typeof quickVitalTargets]
      if (target) {
        scrollToSection(target)
      }
    },
    [quickVitalTargets, scrollToSection],
  )

  const quickVitals = useMemo<QuickVital[]>(() => {
    if (!snapshot) return []
    const vitals: QuickVital[] = []
    const formatNumber = (value: number, digits = 0) => value.toFixed(digits)
    const sampleHint = sparklineSampleCount || 1

    vitals.push({
      key: 'temperature',
      label: t('realtime.quick.temperature'),
      value: `${formatNumber(snapshot.reading.temperatureC, 1)}°C`,
      highlight: temperatureHighlight,
      trendDirection: temperatureTrend?.direction,
      trendLabel: temperatureTrend?.label,
      sparkline: buildSparklineSeries((reading) => reading.temperatureC),
      footer: temperatureProgressLabel ?? undefined,
      tooltip: t('realtime.quick.tooltip.temperature', {
        samples: sampleHint,
        warning: 28,
        critical: 31,
      }),
    })

    vitals.push({
      key: 'humidity',
      label: t('realtime.quick.humidity'),
      value: `${Math.round(snapshot.reading.humidityPercent)}%`,
      highlight: humidityHighlight,
      trendDirection: humidityTrend?.direction,
      trendLabel: humidityTrend?.label,
      sparkline: buildSparklineSeries((reading) => reading.humidityPercent),
      footer: humidityProgressLabel ?? undefined,
      tooltip: t('realtime.quick.tooltip.humidity', {
        samples: sampleHint,
        low: 30,
        high: 65,
      }),
    })

    vitals.push({
      key: 'water',
      label: t('realtime.quick.water'),
      value: waterConsumedMl !== null ? `${Math.round(waterConsumedMl)} ml` : '--',
      highlight: waterHighlight,
      trendDirection: waterTrend?.direction,
      trendLabel: waterTrend?.label,
      sparkline: buildSparklineSeries((reading) => reading.waterIntakeMl),
      footer:
        waterRemainingMl !== null
          ? t('data.water.footer', { remaining: Math.round(waterRemainingMl) })
          : undefined,
      tooltip: t('realtime.quick.tooltip.water', {
        samples: sampleHint,
        reserve: Math.max(1, Math.round(settings.waterBowlLevelTargetMl * 0.2)),
      }),
    })

    vitals.push({
      key: 'light',
      label: t('realtime.quick.light'),
      value:
        brightnessValue === undefined
          ? '--'
          : `${Math.round(brightnessValue)}%`,
      highlight: brightnessHighlight,
      trendDirection: brightnessTrend?.direction,
      trendLabel: brightnessTrend?.label,
      sparkline: buildSparklineSeries((reading) => reading.ambientLightPercent ?? null),
      footer: brightnessProgressLabel ?? undefined,
      tooltip: t('realtime.quick.tooltip.light', {
        samples: sampleHint,
        low: 15,
        high: 85,
      }),
    })

    vitals.push({
      key: 'cat',
      label: t('realtime.quick.cat'),
      value: catPresent ? t('data.catPresence.inside') : t('data.catPresence.away'),
      highlight: catPresenceHighlight,
      trendDirection: catPresenceTrend?.direction,
      trendLabel: catPresenceTrend?.label,
      sparkline: buildSparklineSeries((reading) => (reading.catPresent ?? reading.catWeightKg >= 1 ? 1 : 0)),
      footer: t('data.catPresence.footer'),
      tooltip: t('realtime.quick.tooltip.cat', {
        samples: sampleHint,
      }),
    })

    return vitals
  }, [
    snapshot,
    t,
    temperatureHighlight,
    humidityHighlight,
    waterHighlight,
    brightnessHighlight,
    catPresenceHighlight,
    temperatureTrend,
    humidityTrend,
    waterTrend,
    brightnessTrend,
    catPresenceTrend,
    buildSparklineSeries,
    sparklineSampleCount,
    temperatureProgressLabel,
    humidityProgressLabel,
    brightnessProgressLabel,
    waterConsumedMl,
    waterRemainingMl,
    settings.waterBowlLevelTargetMl,
    brightnessValue,
    catPresent,
  ])

  useEffect(() => {
    const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical')
    const signatureParts: string[] = []
    if (temperatureHighlight === 'critical') {
      signatureParts.push('temp')
    }
    if (waterHighlight === 'critical') {
      signatureParts.push('water')
    }
    if (criticalAlerts.length) {
      signatureParts.push(
        criticalAlerts
          .map((alert) => `${alert.timestamp ?? ''}:${alert.message}`)
          .join('|'),
      )
    }

    const signature = signatureParts.join(',')
    if (!signature) {
      if (lastAlertSignature !== null) {
        setLastAlertSignature(null)
      }
      return
    }

    if (signature !== lastAlertSignature) {
      playWarningTone()
      setLastAlertSignature(signature)
    }
  }, [alerts, lastAlertSignature, temperatureHighlight, waterHighlight])

  return (
    <div className="app-shell">
      <AlertBanner
        alerts={alerts}
        autoDismissMs={15000}
        onAudioAlert={(alert) => {
          // Optional: play audio alert for critical alerts
          if (alert.severity === 'critical') {
            playWarningTone().catch((err) => {
              console.warn('[alert-banner] Failed to play audio alert:', err)
            })
          }
        }}
      />
      <a href="#main-content" className="skip-link">
        {t('app.skipToContent')}
      </a>
      {backendOffline ? (
        <div className="offline-banner">
          <span>{t('notifications.offline')}</span>
          <button type="button" onClick={() => refreshHealth()}>
            {t('notifications.offline.cta')}
          </button>
        </div>
      ) : null}
      <header className="app-header" role="banner" aria-label={t('app.header')}>
        <div className="app-brand">
          <img src={iconUrl} alt={t('app.title')} className="app-brand__icon" />
          <div>
            <h1>{brandTitle}</h1>
            <p>{brandSubtitle}</p>
          </div>
        </div>
        <div className="header-actions">
          {/* Temporarily disabled for debugging */}
          {/* <PetTypeSwitcher
            profiles={petProfiles}
            currentProfile={currentPetProfile}
            onSwitch={switchPetProfile}
            onAddNew={refreshPetProfiles}
            loading={petProfilesLoading}
          /> */}
          <div className="refresh-hud refresh-hud--compact" role="status" aria-live="polite">
            <span className="refresh-hud__timestamp">{lastUpdatedLabel}</span>
            <div className="refresh-hud__chips">
              <span className={backendStatusClass}>{backendStatusLabel}</span>
              <span className="status-pill status-pill--info refresh-hud__chip">{refreshAutoLabel}</span>
              {backendRecoveringLabel ? (
                <span className="status-pill status-pill--warn refresh-hud__chip">{backendRecoveringLabel}</span>
              ) : null}
            </div>
          </div>
          <div className="header-actions__buttons">
            <button
              type="button"
              className="action-button"
              onClick={handleRefreshAll}
              disabled={combinedRefreshLoading}
            >
              {combinedRefreshLoading ? t('app.refreshLoading') : t('app.refresh')}
            </button>
            <button
              type="button"
              className="action-button action-button--secondary"
              onClick={enableNotifications}
              title={notificationButtonTooltip}
            >
              {notificationButtonLabel}
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={() => setSettingsOpen((prev) => !prev)}
            >
              {t('settings.button')}
            </button>
            <div className="header-account">
              <span className="header-account__name">{user.displayName}</span>
              <span className="header-account__role">{roleLabel}</span>
            </div>
            <button
              type="button"
              className="action-button action-button--ghost header-account__logout"
              onClick={() => {
                void handleLogout()
              }}
              disabled={loggingOut}
            >
              {loggingOut ? t('auth.logout.loading') : t('auth.logout')}
            </button>
          </div>
          {settingsOpen ? (
            <div className="settings-popover" role="dialog" aria-label={t('settings.language')}>
              <p>{t('settings.language')}</p>
              {options.map((option) => (
                <label key={option.code} className="settings-option">
                  <input
                    type="radio"
                    name="language"
                    value={option.code}
                    checked={language === option.code}
                    onChange={() => updateLanguage(option.code)}
                  />
                  <span>{t(option.labelKey)}</span>
                </label>
              ))}
              <div className="settings-divider" />
              <p>{t('settings.theme')}</p>
              {THEME_OPTIONS.map((option) => {
                const optionLabel =
                  option.code === 'auto'
                    ? `${t(option.labelKey)} · ${t(THEME_LABEL_KEY_MAP[appliedTheme])}`
                    : t(option.labelKey)
                return (
                  <label key={option.code} className="settings-option">
                    <input
                      type="radio"
                      name="theme"
                      value={option.code}
                      checked={theme === option.code}
                      onChange={() => updateTheme(option.code)}
                    />
                    <span>{optionLabel}</span>
                  </label>
                )
              })}
              <div className="settings-popover__actions">
                <button
                  type="button"
                  className="action-button action-button--secondary"
                  onClick={triggerTestNotification}
                >
                  {t('notifications.test')}
                </button>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => setShowNotificationWizard(true)}
                >
                  {t('notifications.troubleshoot.open')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {notificationStatus === 'denied' ? (
        <InlineNotice variant="warning" message={t('notifications.enableInstructions')} />
      ) : null}

      {error ? (
        <InlineNotice
          variant="error"
          message={
            error === 'fetch'
              ? t('errors.fetch')
              : error === 'backend'
                ? t('errors.backendMissing')
                : t('errors.settings')
          }
        />
      ) : null}
      {notificationMessageContent ? (
        <InlineNotice variant="info" message={notificationMessageContent} />
      ) : null}
      {validationMessages.map((warning) => (
        <InlineNotice key={warning.id} variant="warning" message={warning.message} />
      ))}
      {!loading && !snapshot ? (
        <InlineNotice variant="info" message={t('overview.emptyState')} />
      ) : null}

      <main className="content-grid" id="main-content" role="main" aria-label={t('app.mainContent')}>
        <MobileSectionNav items={mobileNavItems} onSelect={scrollToSection} />
        <section className="dashboard-overview" id="section-overview" aria-labelledby="overview-heading">
          <div className="dashboard-overview__lead">
            <div className="dashboard-overview__profile-switchers">
              <HardwareProfileSwitcher
                profiles={hardwareProfiles}
                activeProfileId={activeHardwareProfile?.id ?? ''}
                onSelect={handleHardwareProfileSelect}
                onCreateCustom={handleAddCustomHardwareProfile}
              />
              <CatSwitcher
                cats={cats}
                activeCatId={activeCatId}
                onSelect={selectCat}
                onAdd={(name) => addCat({ name, setActive: true })}
                onRename={(catId, newName) => editCat(catId, { name: newName })}
                loading={catsLoading}
                error={catsError}
              />
            </div>
            <p className="hardware-profile-description">
              {activeHardwareProfile?.description ?? envDescription}
            </p>
            {showEmptyOverview ? (
              <div className="panel panel--empty hero-summary__placeholder">
                <p>{t('overview.emptyState')}</p>
                <div className="hero-summary__actions">
                  <button type="button" className="action-button" onClick={handleRefreshAll}>
                    {t('app.refresh')}
                  </button>
                  <button
                    type="button"
                    className="action-button action-button--secondary"
                    onClick={() => setSettingsOpen(true)}
                  >
                    {t('settings.button')}
                  </button>
                </div>
              </div>
            ) : (
              <HeroSummary
                snapshot={snapshot ?? null}
                alerts={alerts}
                insights={insights}
                sections={sectionAnchors}
                onNavigate={handleNavigate}
                isMockMode={isMockMode}
              />
            )}
          </div>
          <div className="dashboard-overview__side">
            <StatusOverview
              snapshot={snapshot}
              alerts={alerts}
              insights={insights}
              isMockMode={isMockMode}
              realtimeStatus={realtimeStatus}
            />
            {quickVitals.length ? (
              <RealtimeQuickVitals
                vitals={quickVitals}
                lastUpdatedLabel={lastUpdatedLabel}
                onSelect={handleQuickVitalSelect}
              />
            ) : null}
            {isDeveloper ? <AiSummaryCard summary={aiSummary} lastUpdatedLabel={lastUpdatedLabel} /> : null}
          </div>
        </section>

        <Suspense fallback={<Loader />}>
          <HighRiskOverview
            insights={careInsights}
            pendingTasks={pendingCareTasks}
            onNavigateToInsights={goToInsights}
            onNavigateToTasks={goToTasks}
            onCreateInsightTask={API_BASE_URL ? handleCreateTaskFromInsight : undefined}
            creatingInsightId={insightTaskBusyId}
          />
        </Suspense>
        <section className="care-intelligence" id="section-care">
          <Suspense fallback={<Loader />}>
            <CareCommandCenter snapshot={snapshot ?? null} alerts={alerts} />
          </Suspense>
        </section>
        {showInsightsSection ? (
          <section className="insights-grid" id="section-insights" ref={insightsRef}>
            {layoutLoading ? (
              <div className="panel__empty">
                <Loader size="small" />
                <span>{t('dashboardPreferences.loading')}</span>
              </div>
            ) : null}
            {insightsEnabled ? (
              insightPanelNodes.length > 0 ? (
                insightPanelNodes
              ) : (
                <div className="panel panel--empty">
                  <div className="panel__empty">
                    <Loader size="small" />
                  </div>
                </div>
              )
            ) : (
              <div className="panel">
                <header className="panel__header">
                  <div>
                    <h3>{insightsPlaceholderTitle}</h3>
                    <p>{insightsPlaceholderBody}</p>
                  </div>
                </header>
                <div className="panel__body">
                  <button type="button" className="action-button" onClick={handleEnableInsights}>
                    {insightsPlaceholderCta}
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}
        {showCareTasksSection ? (
          <section className="care-tasks-grid" id="section-tasks">
            <Suspense fallback={<Loader />}>
              <CareTaskBoard
                pending={pendingCareTasks}
                completed={completedCareTasks}
                loading={careTasksLoading}
                error={careTasksError}
                onSetStatus={setCareTaskStatus}
                onRemove={removeCareTask}
                onCreate={addCareTask}
                onGenerateSuggestions={generateCareTaskSuggestions}
                onRefresh={refreshCareTasks}
              />
            </Suspense>
          </section>
        ) : null}
        <section className="panel wide" id="section-realtime">
          <header className="panel__header">
            <h2>{t('panel.realtime.title')}</h2>
            <p>{t('panel.realtime.subtitle')}</p>
          </header>
          <div className="data-grid">
            <DataCard
              title={t('data.temperature.title')}
              value={snapshot ? snapshot.reading.temperatureC.toString() : '--'}
              unit="°C"
              highlight={temperatureHighlight}
              statusLabel={statusLabels[temperatureHighlight]}
              trend={temperatureTrend}
              footer={t('data.temperature.footer', {
                value: settings.targetTemperatureC,
              })}
              progress={{
                current: snapshot ? snapshot.reading.temperatureC : null,
                target: settings.targetTemperatureC,
                min: 10,
                max: 38,
                label: temperatureProgressLabel,
              }}
            />
            <DataCard
              title={t('data.humidity.title')}
              value={snapshot ? snapshot.reading.humidityPercent.toString() : '--'}
              unit="%"
              highlight={humidityHighlight}
              statusLabel={statusLabels[humidityHighlight]}
              trend={humidityTrend}
              footer={t('data.humidity.footer', {
                value: settings.targetHumidityPercent,
              })}
              progress={{
                current: snapshot ? snapshot.reading.humidityPercent : null,
                target: settings.targetHumidityPercent,
                min: 0,
                max: 100,
                label: humidityProgressLabel,
              }}
            />
            <DataCard
              title={t('data.brightness.title')}
              value={
                brightnessValue !== undefined
                  ? Math.round(brightnessValue).toString()
                  : '--'
              }
              unit="%"
              highlight={brightnessHighlight}
              statusLabel={statusLabels[brightnessHighlight]}
              trend={brightnessTrend}
              footer={t('data.brightness.footer')}
              progress={{
                current: brightnessValue ?? null,
                target: IDEAL_BRIGHTNESS,
                min: 0,
                max: 100,
                label: brightnessProgressLabel,
              }}
            />
            <DataCard
              title={t('data.water.title')}
              value={
                waterConsumedMl !== null ? Math.round(waterConsumedMl).toString() : '--'
              }
              unit="ml"
              highlight={waterHighlight}
              statusLabel={statusLabels[waterHighlight]}
              trend={waterTrend}
              footer={
                waterRemainingMl !== null
                  ? t('data.water.footer', {
                      remaining: Math.round(waterRemainingMl),
                    })
                  : t('data.water.footerNoData')
              }
            />
            <DataCard
              title={t('data.weight.title')}
              value={snapshot ? snapshot.reading.catWeightKg.toString() : '--'}
              unit="kg"
              highlight="normal"
              statusLabel={statusLabels.normal}
              trend={weightTrend}
              footer={t('data.weight.footer')}
            />
            <DataCard
              title={t('data.catPresence.title')}
              value={catPresent ? t('data.catPresence.inside') : t('data.catPresence.away')}
              highlight={catPresenceHighlight}
              statusLabel={statusLabels[catPresenceHighlight]}
              trend={catPresenceTrend}
              footer={t('data.catPresence.footer')}
            />
            <DataCard
              title={t('data.aqi.title')}
              value={snapshot ? snapshot.reading.airQualityIndex.toString() : '--'}
              highlight="normal"
              statusLabel={statusLabels.normal}
              trend={airQualityTrend}
              footer={t('data.aqi.footer')}
            />
            <DataCard
              title={t('data.feeding.title')}
              value={snapshot ? snapshot.reading.lastFeedingMinutesAgo.toString() : '--'}
              unit={language === 'zh' ? '分鐘' : 'min'}
              highlight="normal"
              statusLabel={statusLabels.normal}
              trend={feedingTrend}
              footer={t('data.feeding.footer', {
                schedule: settings.feederSchedule,
              })}
            />
          </div>
        </section>

        <div id="section-control">
          <ControlPanel
            settings={settings}
            onUpdate={updateSettings}
            disabled={loading}
            suggestion={controlSuggestion}
            onSuggestionApplied={(id) =>
              setControlSuggestion((current) => (current && current.id === id ? null : current))
            }
          />
        </div>

        {snapshot ? (
          <Suspense fallback={<Loader />}>
            <DeviceStatusList status={snapshot.status} />
          </Suspense>
        ) : null}

        <Suspense fallback={<Loader />}>
          <AudioControlPanel status={snapshot?.reading.audio ?? null} />
        </Suspense>

        <Suspense fallback={<Loader />}>
          <UvFanControlPanel status={snapshot?.reading.uvFan ?? null} updatedAt={uvFanStatusUpdatedAt} />
        </Suspense>

        <Suspense fallback={<Loader />}>
          <FeederControlPanel
            status={snapshot?.reading.feeder ?? null}
            weightGrams={snapshot?.reading.foodWeightGrams ?? null}
            version={feederStatusVersion}
          />
        </Suspense>

        <Suspense fallback={<Loader />}>
          <HydrationControlPanel
            status={snapshot?.reading.hydration ?? null}
            version={hydrationStatusVersion}
          />
        </Suspense>

        <Suspense fallback={<Loader />}>
          <CameraMonitorPanel status={snapshot?.reading.vision ?? null} />
        </Suspense>

        {EQUIPMENT_DIAGNOSTICS_ENABLED ? (
          <Suspense fallback={<Loader />}>
            <EquipmentDiagnostics />
          </Suspense>
        ) : null}

        <Suspense fallback={<Loader />}>
          <HistorySummary history={history} />
        </Suspense>
        <Suspense fallback={<Loader />}>
          <TrendCharts history={history} />
        </Suspense>
        {isDeveloper ? (
          <Suspense fallback={<Loader />}>
            <HistoryInspector history={history} />
          </Suspense>
        ) : null}
        <div id="section-alerts">
          <Suspense fallback={<Loader />}>
            <AutomationAlerts alerts={alerts} />
          </Suspense>
        </div>

        <section className="panel advanced-toggle">
          <header className="panel__header">
            <div>
              <h2>{t('advanced.title')}</h2>
              <p>{t('advanced.subtitle')}</p>
            </div>
            <button
              type="button"
              className="action-button action-button--ghost"
              aria-expanded={showAdvanced}
              aria-controls="advanced-content"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? t('advanced.hide') : t('advanced.show')}
            </button>
          </header>
          <p className="advanced-toggle__hint">{t('advanced.hint')}</p>
        </section>

        <div
          id="advanced-content"
          ref={advancedContentRef}
          className={`advanced-stack${showAdvanced ? ' advanced-stack--visible' : ''}`}
          aria-hidden={!showAdvanced}
        >
          {showAdvanced ? (
            <>
              <Suspense fallback={<Loader />}>
                <CalibrationPanel />
              </Suspense>
              {API_BASE_URL ? (
                <div id="section-alerts-rules">
                  <Suspense fallback={<Loader />}>
                    <AlertRuleManager
                      rules={alertRules}
                      loading={alertRulesLoading}
                      onCreate={handleCreateAlertRule}
                      onUpdate={handleUpdateAlertRule}
                      onDelete={handleRemoveAlertRule}
                    />
                  </Suspense>
                </div>
              ) : null}
              <Suspense fallback={<Loader />}>
                <PerformancePanel />
              </Suspense>
              <Suspense fallback={<Loader />}>
                <DashboardPreferencesPanel
                  panels={panelDefinitions}
                  layout={dashboardLayout}
                  loading={layoutLoading}
                  saving={layoutSaving}
                  error={layoutError}
                  onTogglePanel={handleTogglePanel}
                  onMovePanel={handleMovePanel}
                  onReset={handleResetPanels}
                />
              </Suspense>
            </>
          ) : null}
        </div>

        {showAiSuite ? (
          <div className="ai-suite" id="section-ai" ref={aiSuiteRef}>
            {aiSuiteEnabled ? (
              <>
                <div className="ai-suite__primary">
                  <Suspense fallback={<Loader />}>
                    <AIAdvisor insights={insights} collapsible onApplyRecommendation={handleApplyRecommendation} />
                  </Suspense>

                  <Suspense fallback={<Loader />}>
                    <AiChatPanel
                      catId={activeCatId}
                      petProfileId={currentPetProfile?.id ?? null}
                      onRefresh={refresh}
                      onInferenceComplete={refreshHealth}
                      developerMode={isDeveloper}
                      onSaveMemory={
                        API_BASE_URL && isDeveloper
                          ? async ({ content, type, source }: { content: string; type: MemoryType; source: string }) => {
                              await addMemoryEntry({ type, content, source })
                              await refreshMemories()
                              await refreshMemoryKeywords()
                            }
                          : undefined
                      }
                      favorites={API_BASE_URL ? chatFavorites : []}
                      favoritesLoading={API_BASE_URL ? chatFavoritesLoading : false}
                      onAddFavorite={
                        API_BASE_URL
                          ? async ({ messageId, role, content }) => {
                              await addChatFavoriteEntry({ messageId, role, content })
                              await refreshChatFavorites()
                            }
                          : undefined
                      }
                      onRemoveFavorite={
                        API_BASE_URL
                          ? async (id: number, messageId?: string | null) => {
                              await removeChatFavoriteEntry(id, messageId ?? undefined)
                              await refreshChatFavorites()
                            }
                          : undefined
                      }
                      memoryContext={
                        isDeveloper
                          ? {
                              entries: memories,
                              keywords: memoryKeywords,
                            }
                          : undefined
                      }
                    />
                  </Suspense>
                </div>

                {API_BASE_URL && isDeveloper ? (
                  <div className="ai-suite__secondary">
                    <Suspense fallback={<Loader />}>
                      <AiStatusCard
                        health={backendHealth}
                        loading={healthLoading}
                        onRefresh={refreshHealth}
                      />
                    </Suspense>
                    {pinErrorMessage ? <InlineNotice variant="error" message={pinErrorMessage} /> : null}
                    <Suspense fallback={<Loader />}>
                      <AiHighlightsCard
                        events={highlightEvents}
                        pinned={pinnedHighlights}
                        loading={healthLoading}
                        pinning={pinningHighlight}
                        onRefresh={refreshHealth}
                        onTogglePin={handleToggleHighlightPin}
                      />
                    </Suspense>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="panel">
                <header className="panel__header">
                  <div>
                    <h3>{aiSuitePlaceholderTitle}</h3>
                    <p>{aiSuitePlaceholderBody}</p>
                  </div>
                </header>
                <div className="panel__body">
                  <button type="button" className="action-button" onClick={handleEnableAiSuite}>
                    {aiSuitePlaceholderCta}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <Suspense fallback={<Loader />}>
          <UsageGuide />
        </Suspense>
        <Suspense fallback={<Loader />}>
          <KnowledgeCoachPanel />
        </Suspense>

{API_BASE_URL && isDeveloper ? (
  <>
    <section className="memory-dock" id="section-memory">
      <Suspense fallback={<Loader />}>
        <MemoryPanel
          memories={memories}
          loading={memoriesLoading}
          onCreate={async ({ type, content }: { type: MemoryType; content: string }) => {
            await addMemoryEntry({ type, content, source: 'user' })
            await refreshMemories()
            await refreshMemoryKeywords()
          }}
          onUpdate={async (id: number, content: string) => {
            await updateMemoryEntry(id, content)
            await refreshMemories()
            await refreshMemoryKeywords()
          }}
          onDelete={async (id: number) => {
            await deleteMemoryEntry(id)
            await refreshMemories()
            await refreshMemoryKeywords()
          }}
          collapsible
          defaultExpanded={false}
        />
      </Suspense>
      <Suspense fallback={<Loader />}>
        <MemoryKeywordCloud
          keywords={memoryKeywords}
          loading={memoryKeywordsLoading}
          onRefresh={refreshMemoryKeywords}
          collapsible
          defaultExpanded={false}
        />
      </Suspense>
    </section>
    <section className="plugins-grid" id="section-plugins">
      <Suspense fallback={<Loader />}>
        <PluginManagerPanel
          plugins={carePlugins}
          loading={carePluginsLoading}
          error={carePluginsError}
          onRefresh={refreshCarePlugins}
          onToggle={toggleCarePlugin}
          onRemove={removeCarePlugin}
          onRegister={registerCarePlugin}
        />
      </Suspense>
    </section>
  </>
) : null}
      </main>

      {showScrollTop ? (
        <button type="button" className="scroll-top" onClick={scrollToTop} aria-label={t('hero.backTop')}>
          <span aria-hidden>↑</span>
          <span className="sr-only">{t('hero.backTop')}</span>
        </button>
      ) : null}

      <Suspense fallback={null}>
        <NotificationTroubleshooter
          open={showNotificationWizard}
          onClose={() => setShowNotificationWizard(false)}
          language={language}
        />
      </Suspense>
    </div>
  )
}

function App() {
  const { user, authReady, loading, error, login, logout } = useAuth()

  if (!authReady) {
    return (
      <div className="auth-screen auth-screen--loading">
        <Loader />
      </div>
    )
  }

  if (!user) {
    return <LoginPanel loading={loading} error={error} onSubmit={login} />
  }

  return <AuthenticatedApp user={user} onLogout={logout} />
}

export default App
