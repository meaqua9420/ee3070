# 🏠 多寵物智慧家居系統實現方案

## 📋 需求分析

### 核心功能:
- ✅ 頂部切換按鍵 (貓 ↔ 狗 ↔ 鳥 ↔ 其他)
- ✅ 用戶自定義寵物類型和名稱
- ✅ 共享介面佈局,動態調整參數
- ✅ 獨立數據存儲
- ✅ AI 助手自動適配寵物類型

---

## 🎨 **方案 A: 輕量級實現** (推薦快速上線)

### **1. 前端切換器設計**

#### **UI 位置**: 頂部導航欄右側

```tsx
// src/components/PetTypeSwitcher.tsx

import { useState, useEffect } from 'react'
import { ChevronDown, Cat, Dog, Bird, Plus } from 'lucide-react'

interface PetProfile {
  id: string
  type: 'cat' | 'dog' | 'bird' | 'custom'
  name: string
  icon?: string
  customLabel?: string  // 自定義標籤 (如「兔子」、「倉鼠」)
}

export function PetTypeSwitcher() {
  const [profiles, setProfiles] = useState<PetProfile[]>([
    { id: 'default', type: 'cat', name: 'Meme' },
  ])
  const [currentId, setCurrentId] = useState('default')
  const [showMenu, setShowMenu] = useState(false)

  const currentProfile = profiles.find(p => p.id === currentId)

  const petIcons = {
    cat: <Cat className="w-5 h-5" />,
    dog: <Dog className="w-5 h-5" />,
    bird: <Bird className="w-5 h-5" />,
    custom: <span className="text-lg">🐾</span>,
  }

  const handleSwitch = async (profileId: string) => {
    setCurrentId(profileId)
    setShowMenu(false)

    // 保存到 localStorage
    localStorage.setItem('currentPetProfile', profileId)

    // 通知全局狀態更新 (觸發重新載入數據)
    window.dispatchEvent(new CustomEvent('petProfileChanged', {
      detail: { profileId }
    }))
  }

  const handleAddNew = () => {
    // 打開新增對話框
    // ... (見下方 PetProfileDialog)
  }

  return (
    <div className="relative">
      {/* 當前寵物顯示 */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800
                   rounded-lg border border-gray-200 dark:border-gray-700
                   hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        {petIcons[currentProfile?.type || 'cat']}
        <span className="font-medium">{currentProfile?.name || 'Meme'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉選單 */}
      {showMenu && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-white dark:bg-gray-800
                        rounded-lg shadow-xl border border-gray-200 dark:border-gray-700
                        z-50 overflow-hidden">
          {/* 寵物列表 */}
          <div className="max-h-80 overflow-y-auto">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => handleSwitch(profile.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50
                           dark:hover:bg-gray-700 transition ${
                  profile.id === currentId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                {petIcons[profile.type]}
                <div className="flex-1 text-left">
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-xs text-gray-500">
                    {profile.customLabel ||
                     { cat: '貓咪', dog: '狗狗', bird: '鳥類', custom: '其他' }[profile.type]}
                  </div>
                </div>
                {profile.id === currentId && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
          </div>

          {/* 新增按鈕 */}
          <div className="border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleAddNew}
              className="w-full flex items-center gap-2 px-4 py-3 text-blue-600
                         dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">新增寵物家居</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### **2. 新增寵物對話框**

```tsx
// src/components/PetProfileDialog.tsx

interface PetProfileDialogProps {
  open: boolean
  onClose: () => void
  onSave: (profile: PetProfile) => void
}

export function PetProfileDialog({ open, onClose, onSave }: PetProfileDialogProps) {
  const [type, setType] = useState<'cat' | 'dog' | 'bird' | 'custom'>('cat')
  const [name, setName] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  const petTypes = [
    { value: 'cat', label: '貓咪家居', icon: '🐱', description: '適合貓咪的智慧環境' },
    { value: 'dog', label: '狗狗家居', icon: '🐶', description: '適合狗狗的智慧環境' },
    { value: 'bird', label: '鳥類家居', icon: '🦜', description: '適合鳥類的智慧環境' },
    { value: 'custom', label: '自訂寵物', icon: '🐾', description: '其他類型寵物' },
  ]

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('請輸入寵物名稱')
      return
    }

    const newProfile: PetProfile = {
      id: `pet_${Date.now()}`,
      type,
      name: name.trim(),
      customLabel: type === 'custom' ? customLabel.trim() : undefined,
    }

    onSave(newProfile)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4">
        {/* 標題 */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold">新增寵物家居</h2>
          <p className="text-sm text-gray-500 mt-1">設定新的智慧寵物居住空間</p>
        </div>

        {/* 表單 */}
        <div className="p-6 space-y-4">
          {/* 寵物類型選擇 */}
          <div>
            <label className="block text-sm font-medium mb-2">寵物類型</label>
            <div className="grid grid-cols-2 gap-3">
              {petTypes.map(pt => (
                <button
                  key={pt.value}
                  onClick={() => setType(pt.value as any)}
                  className={`p-4 rounded-lg border-2 transition ${
                    type === pt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{pt.icon}</div>
                  <div className="text-sm font-medium">{pt.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{pt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 寵物名稱 */}
          <div>
            <label className="block text-sm font-medium mb-2">寵物名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: Meme, Lucky, Tweety..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600
                         rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 自訂標籤 (只在 custom 時顯示) */}
          {type === 'custom' && (
            <div>
              <label className="block text-sm font-medium mb-2">寵物種類</label>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="例如: 兔子, 倉鼠, 烏龜..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600
                           rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* 按鈕 */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700
                        flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100
                       dark:hover:bg-gray-700 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                       transition font-medium"
          >
            新增
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

### **3. 後端 API 調整**

#### **新增 Pet Profiles 管理端點**

```typescript
// src/index.ts

// 儲存寵物配置 (使用 localStorage 或後端數據庫)
interface PetProfileConfig {
  id: string
  type: 'cat' | 'dog' | 'bird' | 'custom'
  name: string
  customLabel?: string

  // 特定參數範圍 (根據寵物類型調整)
  temperatureRange: { min: number; max: number }
  humidityRange: { min: number; max: number }

  // AI Prompt 關鍵字
  aiKeywords: string[]  // ['cat', 'feline', '貓'] or ['dog', 'canine', '狗']

  createdAt: string
  updatedAt: string
}

// GET /api/pet-profiles - 獲取所有寵物配置
app.get('/api/pet-profiles', (req, res) => {
  try {
    const profiles = db
      .prepare('SELECT * FROM pet_profiles ORDER BY createdAt DESC')
      .all() as PetProfileConfig[]

    res.json({ ok: true, profiles })
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to load profiles' })
  }
})

// POST /api/pet-profiles - 新增寵物配置
app.post('/api/pet-profiles', verifyAdminAuth, (req, res) => {
  try {
    const { type, name, customLabel } = req.body

    // 根據類型設定預設參數
    const config = getPetTypeDefaults(type)

    const profile: PetProfileConfig = {
      id: `pet_${Date.now()}`,
      type,
      name,
      customLabel,
      ...config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    db.prepare(`
      INSERT INTO pet_profiles (id, type, name, custom_label, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      profile.type,
      profile.name,
      profile.customLabel || null,
      JSON.stringify(config),
      profile.createdAt,
      profile.updatedAt,
    )

    res.json({ ok: true, profile })
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to create profile' })
  }
})

// 預設配置生成器
function getPetTypeDefaults(type: string) {
  const defaults = {
    cat: {
      temperatureRange: { min: 18, max: 28 },
      humidityRange: { min: 40, max: 60 },
      aiKeywords: ['cat', 'feline', '貓', '貓咪', 'kitten'],
      feedingSchedule: '08:00,18:00',
      waterTarget: 200, // ml
    },
    dog: {
      temperatureRange: { min: 16, max: 26 },
      humidityRange: { min: 30, max: 70 },
      aiKeywords: ['dog', 'canine', '狗', '狗狗', 'puppy'],
      feedingSchedule: '07:00,12:00,19:00',
      waterTarget: 500, // ml (狗狗需水量較大)
    },
    bird: {
      temperatureRange: { min: 20, max: 25 },
      humidityRange: { min: 50, max: 70 },  // 鳥類需較高濕度
      aiKeywords: ['bird', 'avian', '鳥', '鳥類', 'parrot'],
      feedingSchedule: '06:00,18:00',
      waterTarget: 100, // ml
    },
    custom: {
      temperatureRange: { min: 18, max: 26 },
      humidityRange: { min: 40, max: 60 },
      aiKeywords: ['pet', '寵物'],
      feedingSchedule: '08:00,18:00',
      waterTarget: 200,
    },
  }

  return defaults[type as keyof typeof defaults] || defaults.custom
}
```

---

### **4. 數據庫遷移**

```typescript
// src/db.ts - 在 MIGRATIONS 陣列中添加

const MIGRATIONS: Migration[] = [
  // ... 現有遷移 ...

  {
    id: '010_pet_profiles',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pet_profiles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('cat', 'dog', 'bird', 'custom')),
          name TEXT NOT NULL,
          custom_label TEXT,
          config TEXT NOT NULL,  -- JSON 格式存儲參數配置
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pet_profiles_type ON pet_profiles(type);
        CREATE INDEX IF NOT EXISTS idx_pet_profiles_created_at ON pet_profiles(created_at);

        -- 插入預設貓咪配置
        INSERT OR IGNORE INTO pet_profiles (id, type, name, custom_label, config, created_at, updated_at)
        VALUES (
          'default',
          'cat',
          'Meme',
          NULL,
          '{"temperatureRange":{"min":18,"max":28},"humidityRange":{"min":40,"max":60},"aiKeywords":["cat","feline","貓","貓咪"],"feedingSchedule":"08:00,18:00","waterTarget":200}',
          datetime('now'),
          datetime('now')
        );
      `)
    },
  },
]
```

---

### **5. AI Prompt 動態調整**

```typescript
// src/ai.ts - 修改 buildSystemPrompt

function buildSystemPrompt(
  language: LanguageCode,
  isDeveloperMode: boolean,
  petProfile?: PetProfileConfig  // 新增參數
): string {
  const petType = petProfile?.type || 'cat'
  const petName = petProfile?.name || 'Meme'
  const petLabel = petProfile?.customLabel ||
    { cat: '貓咪', dog: '狗狗', bird: '鳥類', custom: '寵物' }[petType]

  // 根據寵物類型動態調整身份
  const identity = language === 'en'
    ? `You are "Meme", the caring AI assistant for Smart ${petLabel} Home. You help monitor and care for ${petName}, a beloved ${petType}.`
    : `你是「Meme」，Smart ${petLabel} Home 的貼心 AI 助理。你負責照顧 ${petName}，一隻可愛的${petLabel}。`

  // 動態調整知識庫
  const knowledgeHint = language === 'en'
    ? `When providing care advice, focus on ${petType}-specific needs: ${petProfile?.aiKeywords.join(', ')}.`
    : `提供照護建議時，專注於${petLabel}的特定需求。相關關鍵字：${petProfile?.aiKeywords.join('、')}。`

  // 動態調整參數範圍提示
  const parameterRanges = language === 'en'
    ? `Safe ranges for ${petName}:
       - Temperature: ${petProfile?.temperatureRange.min}°C - ${petProfile?.temperatureRange.max}°C
       - Humidity: ${petProfile?.humidityRange.min}% - ${petProfile?.humidityRange.max}%
       - Water target: ${petProfile?.waterTarget}ml`
    : `${petName} 的安全範圍：
       - 溫度：${petProfile?.temperatureRange.min}°C - ${petProfile?.temperatureRange.max}°C
       - 濕度：${petProfile?.humidityRange.min}% - ${petProfile?.humidityRange.max}%
       - 飲水目標：${petProfile?.waterTarget}ml`

  const base = `${identity}

${knowledgeHint}

${parameterRanges}

... (其他現有的 prompt 內容)
`

  return base
}
```

---

### **6. 前端全局狀態管理**

```tsx
// src/hooks/usePetProfile.ts

import { useState, useEffect } from 'react'

export function usePetProfile() {
  const [currentProfileId, setCurrentProfileId] = useState(() => {
    return localStorage.getItem('currentPetProfile') || 'default'
  })

  const [profile, setProfile] = useState<PetProfileConfig | null>(null)

  // 監聽切換事件
  useEffect(() => {
    const handleChange = (e: CustomEvent) => {
      setCurrentProfileId(e.detail.profileId)
    }

    window.addEventListener('petProfileChanged', handleChange as any)
    return () => window.removeEventListener('petProfileChanged', handleChange as any)
  }, [])

  // 載入配置
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch(`/api/pet-profiles/${currentProfileId}`)
        const data = await res.json()
        if (data.ok) {
          setProfile(data.profile)
        }
      } catch (error) {
        console.error('Failed to load pet profile:', error)
      }
    }

    loadProfile()
  }, [currentProfileId])

  return { profile, currentProfileId, setCurrentProfileId }
}
```

```tsx
// src/App.tsx - 在頂部添加切換器

import { PetTypeSwitcher } from './components/PetTypeSwitcher'

function App() {
  return (
    <div className="min-h-screen">
      {/* 頂部導航欄 */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">Smart Pet Home</h1>
            </div>

            {/* 寵物切換器 */}
            <PetTypeSwitcher />
          </div>
        </div>
      </nav>

      {/* 主要內容 */}
      <main>
        {/* ... 現有頁面 ... */}
      </main>
    </div>
  )
}
```

---

## 🎨 **方案 B: 完整多租戶架構** (長期演進)

如果需要更複雜的功能 (多用戶、雲端同步等):

### **1. 數據隔離策略**

```sql
-- 每個寵物配置有獨立的數據命名空間
CREATE TABLE pet_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL REFERENCES pet_profiles(id),
  temperature REAL,
  humidity REAL,
  water_level REAL,
  timestamp TEXT NOT NULL
);

CREATE TABLE pet_settings (
  profile_id TEXT PRIMARY KEY REFERENCES pet_profiles(id),
  auto_mode BOOLEAN DEFAULT 1,
  target_temperature_c REAL DEFAULT 24,
  -- ... 其他設定
);
```

### **2. URL 路由策略**

```
/cat/dashboard      → 貓咪家居儀表板
/dog/dashboard      → 狗狗家居儀表板
/bird/dashboard     → 鳥類家居儀表板
/custom/rabbit/dashboard → 自訂兔子家居

或使用查詢參數:
/?profile=cat_meme
/?profile=dog_lucky
```

### **3. 硬體設備綁定**

```typescript
// 每個寵物配置綁定不同的硬體設備
interface HardwareBinding {
  profileId: string
  deviceId: string
  deviceType: 'sensor' | 'feeder' | 'camera' | 'purifier'
  apiKey: string
}

// 允許一個硬體設備服務多個寵物 (例如多貓家庭)
```

---

## 📊 **視覺設計建議**

### **切換器樣式**

```css
/* 頂部固定 + 下拉選單 */
.pet-switcher {
  position: sticky;
  top: 0;
  z-index: 100;
  background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
}

/* 根據寵物類型變色 */
.pet-theme-cat { background: linear-gradient(to right, #f093fb 0%, #f5576c 100%); }
.pet-theme-dog { background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%); }
.pet-theme-bird { background: linear-gradient(to right, #43e97b 0%, #38f9d7 100%); }
```

### **圖標建議**

- 🐱 **貓**: Cat icon (lucide-react)
- 🐶 **狗**: Dog icon
- 🦜 **鳥**: Bird icon
- 🐰 **兔子**: Rabbit emoji
- 🐹 **倉鼠**: Hamster emoji
- 🐢 **烏龜**: Turtle emoji

---

## ⚡ **實現優先級**

### **Phase 1: 基礎切換** (1-2 天)
- ✅ 前端切換器組件
- ✅ LocalStorage 儲存當前選擇
- ✅ 動態調整 UI 標題/圖標
- ✅ AI Prompt 動態調整

### **Phase 2: 數據管理** (2-3 天)
- ✅ 數據庫遷移 (pet_profiles 表)
- ✅ 後端 API (CRUD)
- ✅ 新增寵物對話框
- ✅ 參數範圍動態調整

### **Phase 3: 高級功能** (1 週)
- ✅ 數據隔離 (每個寵物獨立歷史)
- ✅ 知識庫動態載入 (dog-care, bird-care...)
- ✅ 多硬體綁定
- ✅ 雲端同步

---

## 🎯 **快速開始 (最小實現)**

如果只想快速驗證概念,最簡單的方式:

1. **前端**: 在 `localStorage` 存儲 `petType: 'cat' | 'dog' | 'bird'`
2. **UI**: 根據 `petType` 動態改變標題和圖標
3. **AI**: 在發送請求時帶上 `petType` 參數
4. **後端**: `buildSystemPrompt` 根據 `petType` 調整 prompt

**代碼示例** (30 分鐘實現):

```tsx
// 簡單版本 - 只在前端切換
const [petType, setPetType] = useState<'cat' | 'dog' | 'bird'>('cat')

const petConfig = {
  cat: { name: 'Meme', icon: '🐱', title: 'Smart Cat Home' },
  dog: { name: 'Lucky', icon: '🐶', title: 'Smart Dog Home' },
  bird: { name: 'Tweety', icon: '🦜', title: 'Smart Bird Home' },
}

// 切換器
<select onChange={(e) => setPetType(e.target.value)}>
  <option value="cat">🐱 貓咪家居</option>
  <option value="dog">🐶 狗狗家居</option>
  <option value="bird">🦜 鳥類家居</option>
</select>

// 動態標題
<h1>{petConfig[petType].icon} {petConfig[petType].title}</h1>

// AI 請求時帶上類型
fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message, petType })
})
```

---

## 💡 **其他建議**

### **1. 主題色切換**
- 貓: 粉紅/紫色系
- 狗: 藍色系
- 鳥: 綠色系

### **2. 動畫效果**
- 切換時淡入淡出
- 圖標旋轉動畫

### **3. 雲端同步**
- 使用者登入後,配置跟著帳號走
- 支援多設備同步

### **4. 分享功能**
- 生成分享連結: `smartpethome.com/invite/cat_meme`
- 家人可以共同監控

---

**選擇建議**:
- 🚀 **快速上線**: 用最簡單的 localStorage + 前端切換
- ⚡ **平衡方案**: 方案 A (數據庫 + API)
- 🏢 **企業級**: 方案 B (多租戶架構)

需要我幫你實現哪個方案?或者我可以先幫你創建一個最小可行版本 (MVP) 代碼!😊
