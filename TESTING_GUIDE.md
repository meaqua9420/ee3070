# 🧪 AI升級功能測試指南

## 選項A完成狀態 ✅

### 已完成項目
1. ✅ 後端SSE串流架構 (`streaming.ts` - 354行)
2. ✅ SSE端點 (`/api/chat/stream`)
3. ✅ 前端SSE客戶端 (`sseClient.ts` - 373行)
4. ✅ ThinkingIndicator組件 (動畫+軌跡面板)
5. ✅ AiChatPanel UI改造 (搜尋圖標按鈕)
6. ✅ i18n雙語翻譯
7. ✅ CSS樣式（搜尋按鈕動畫效果）

---

## 快速測試步驟

### 1. 啟動後端
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
npm run dev
```

### 2. 啟動前端
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-home
npm run dev
```

### 3. 測試功能清單

#### A. 搜尋按鈕測試
- [ ] 輸入框旁邊應該顯示 🔍 圖標
- [ ] 點擊圖標切換搜尋狀態（灰色↔藍色）
- [ ] hover時應該有放大效果
- [ ] 點擊時應該有縮小動畫

#### B. 思考指示器測試
- [ ] 發送訊息時應顯示動畫指示器
- [ ] 階段應按順序顯示：
  - ⟳ 分析數據中...
  - 🧠 調用記憶中...
  - ✨ 生成回應中...
  - 🔧 執行工具中...
  - ⌨️ 輸出中...

#### C. 串流輸出測試
**注意**：當前需要修改 `useAiChat` hook 才能啟用真實串流。
臨時測試可以直接調用：
```javascript
import { sendSSEChatMessage } from '../utils/sseClient'

// 在console測試
sendSSEChatMessage(
  'http://localhost:4000',
  {
    messages: [{ role: 'user', content: '你好' }],
    language: 'zh'
  },
  {
    onToken: (token) => console.log('Token:', token),
    onPhase: (phase) => console.log('Phase:', phase),
    onDone: (data) => console.log('Done:', data)
  }
)
```

---

## 已知問題與TODO

### ⚠️ 需要後續修復
1. **useAiChat Hook** - 還未連接到SSE端點
   - 當前使用舊的 `/api/chat/suggestions` (非串流)
   - 需要創建 `useSSEChat` hook 或修改現有hook

2. **ThinkingIndicator CSS** - 已創建但需確認導入
   - 文件：`src/components/ThinkingIndicator.css`
   - 需要在 `App.css` 或 `main.tsx` 中導入

3. **串流狀態管理** - AiChatPanel中的狀態鉤子已添加但未連接

---

## 下一步：選項C - 視覺模型全面升級

### 計劃實施內容
1. 創建視覺風險分析器 (`visionRiskAnalyzer.ts`)
2. 改造 `ai.ts` 的 `analyzeImage` 函數
3. 實現多渠道警報系統：
   - PWA推送通知
   - UI紅色警報橫幅
   - 8802B音訊警示
   - 自動創建高優先級任務
   - AI多模型會診
4. ESP32-S3-CAM 定時拍攝功能

---

## 文件變更記錄

### 新建文件 (5個)
```
smart-cat-backend/src/streaming.ts          (354行)
smart-cat-home/src/utils/sseClient.ts       (373行)
smart-cat-home/src/components/ThinkingIndicator.tsx   (143行)
smart-cat-home/src/components/ThinkingIndicator.css   (182行)
EE3070/TESTING_GUIDE.md                     (本文件)
```

### 修改文件 (3個)
```
smart-cat-backend/src/index.ts              (+356行 SSE端點)
smart-cat-home/src/components/AiChatPanel.tsx  (+15行 導入+UI)
smart-cat-home/src/i18n/translations.ts     (+6個翻譯鍵)
smart-cat-home/src/App.css                  (+38行 搜尋按鈕樣式)
```

---

## 性能預期

### SSE串流
- **連接建立**: <100ms
- **首token延遲**: 200-500ms (取決於模型)
- **打字機效果**: 30ms/token
- **最大並發**: 100連接

### 視覺分析（即將實施）
- **單次分析**: 1-3秒 (Qwen3-VL-4B)
- **風險評分**: <50ms
- **警報觸發**: <100ms
- **定時拍攝**: 每30秒（可配置）

---

## 常見問題

**Q: 為什麼看不到串流效果？**
A: 當前 `useAiChat` hook 還未連接到 `/api/chat/stream` 端點，需要後續修改。

**Q: 搜尋按鈕點擊無反應？**
A: 檢查瀏覽器console是否有錯誤，確認翻譯鍵已正確添加。

**Q: ThinkingIndicator不顯示？**
A: 確認CSS文件已導入，並且 `loading` 狀態為 `true`。

**Q: 如何強制使用SSE端點？**
A: 在 `useAiChat.ts` 中將API URL改為 `/api/chat/stream`。

---

## 聯繫資訊

如有問題，請查看：
- Claude Code文檔：https://docs.claude.com/claude-code
- 項目README：`/Users/meaqua/Desktop/EE3070/README.md`
