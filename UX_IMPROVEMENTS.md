# UX 改進元件使用說明

本專案新增了三個改善使用者體驗的元件：

## 1. SkeletonLoader - 載入動畫

用於在資料載入時顯示骨架屏，提升使用者體驗。

### 使用方式

```tsx
import { SkeletonLoader } from './components/SkeletonLoader'

// 在資料載入時顯示 skeleton
{loading ? (
  <SkeletonLoader variant="card" count={3} />
) : (
  <DataCard data={data} />
)}

// 不同的變體
<SkeletonLoader variant="card" />    // 卡片樣式
<SkeletonLoader variant="chart" />   // 圖表樣式
<SkeletonLoader variant="text" />    // 文字樣式
<SkeletonLoader variant="circle" />  // 圓形樣式
```

---

## 2. ToastProvider - 通知系統

提供友善的通知訊息，支援成功、錯誤、警告、資訊四種類型。

### 整合到應用程式

在 `main.tsx` 中包裝你的應用：

```tsx
import { ToastProvider } from './components/ToastProvider'

root.render(
  <StrictMode>
    <ToastProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ToastProvider>
  </StrictMode>
)
```

### 在元件中使用

```tsx
import { useToast } from './components/ToastProvider'

function MyComponent() {
  const { showToast } = useToast()

  const handleSuccess = () => {
    showToast('success', '設定已成功儲存！', 5000)
  }

  const handleError = () => {
    showToast('error', '連線失敗，請稍後再試', 5000)
  }

  const handleWarning = () => {
    showToast('warning', '溫度過高，請注意！')
  }

  const handleInfo = () => {
    showToast('info', '正在同步資料...')
  }

  return (
    <div>
      <button onClick={handleSuccess}>顯示成功訊息</button>
      <button onClick={handleError}>顯示錯誤訊息</button>
    </div>
  )
}
```

---

## 3. ConfirmDialog - 確認對話框

在執行危險操作前顯示確認對話框。

### 整合到應用程式

在 `main.tsx` 中包裝你的應用：

```tsx
import { ConfirmDialogProvider } from './components/ConfirmDialog'

root.render(
  <StrictMode>
    <ToastProvider>
      <ConfirmDialogProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  </StrictMode>
)
```

### 在元件中使用

```tsx
import { useConfirm } from './components/ConfirmDialog'
import { useToast } from './components/ToastProvider'

function MyComponent() {
  const { showConfirm } = useConfirm()
  const { showToast } = useToast()

  const handleDelete = () => {
    showConfirm({
      title: '確認刪除',
      message: '確定要刪除這筆記錄嗎？此操作無法復原。',
      confirmText: '刪除',
      cancelText: '取消',
      type: 'danger',
      onConfirm: async () => {
        // 執行刪除操作
        await deleteRecord()
        showToast('success', '記錄已刪除')
      },
      onCancel: () => {
        showToast('info', '已取消刪除')
      }
    })
  }

  const handleClearHistory = () => {
    showConfirm({
      title: '清除歷史記錄',
      message: '確定要清除所有歷史記錄嗎？',
      confirmText: '確認',
      cancelText: '取消',
      type: 'warning',
      onConfirm: async () => {
        await clearHistory()
        showToast('success', '歷史記錄已清除')
      }
    })
  }

  return (
    <div>
      <button onClick={handleDelete}>刪除記錄</button>
      <button onClick={handleClearHistory}>清除歷史</button>
    </div>
  )
}
```

---

## 完整範例：整合所有功能

```tsx
// main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from './components/ToastProvider'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import { LanguageProvider } from './i18n/LanguageProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import './App.css'

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmDialogProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ConfirmDialogProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
)
```

```tsx
// App.tsx 使用範例
import { useToast } from './components/ToastProvider'
import { useConfirm } from './components/ConfirmDialog'
import { SkeletonLoader } from './components/SkeletonLoader'

function App() {
  const { showToast } = useToast()
  const { showConfirm } = useConfirm()
  const { loading, error, data, updateSettings } = useSmartHomeData()

  const handleSaveSettings = async (newSettings: Settings) => {
    try {
      await updateSettings(newSettings)
      showToast('success', '設定已成功儲存！')
    } catch (error) {
      showToast('error', `儲存失敗：${error.message}`)
    }
  }

  const handleClearData = () => {
    showConfirm({
      title: '清除所有資料',
      message: '此操作將刪除所有歷史記錄和設定，確定要繼續嗎？',
      type: 'danger',
      confirmText: '確認刪除',
      cancelText: '取消',
      onConfirm: async () => {
        await clearAllData()
        showToast('success', '資料已清除')
      }
    })
  }

  if (error) {
    showToast('error', `載入失敗：${error}`)
  }

  return (
    <div className="app">
      {loading ? (
        <SkeletonLoader variant="card" count={4} />
      ) : (
        <>
          <DataCard data={data} />
          <button onClick={handleClearData}>清除資料</button>
        </>
      )}
    </div>
  )
}
```

---

## 好處

1. **更好的載入體驗**：使用 Skeleton Loader 取代空白畫面
2. **友善的通知**：Toast 通知自動消失，不會干擾使用者
3. **防止誤操作**：危險操作前顯示確認對話框
4. **統一的 UI**：所有通知和對話框使用一致的樣式
5. **無障礙支援**：符合 ARIA 標準，支援螢幕閱讀器
