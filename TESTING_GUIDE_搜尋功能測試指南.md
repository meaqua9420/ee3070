# 🧪 搜尋功能改進測試指南

## ✅ 已完成的改進

### 1. **System Prompt 強化**
- ✅ 新增 7 條搜尋結果使用規則
- ✅ 提供好/壞回應範例對比
- ✅ 明確禁止在有結果時說「查不到資訊」

### 2. **搜尋結果視覺化注入**
- ✅ 使用 ASCII 邊框突出顯示
- ✅ 自動格式化為編號列表
- ✅ 添加 6 條強制執行指令

### 3. **思考內容清理強化**
- ✅ 6 步驟清理流程
- ✅ 移除所有 MLX channel 標記
- ✅ 防止內部推理洩露

---

## 🎯 測試方法 A: 前端界面測試 (推薦)

### 步驟:

1. **開啟前端**
   ```bash
   # 前端應該已在運行於:
   open https://localhost:5173
   ```

2. **進入聊天界面**
   - 點擊「AI 聊天」或「Chat」頁面

3. **啟用搜尋功能**
   - 找到「啟用網路搜尋」或「Enable Web Search」選項
   - 確保它是開啟狀態 ✅

4. **發送測試訊息**
   ```
   can you help me search suzumi cat?
   ```

5. **觀察回應**
   檢查以下改進點:
   - [ ] AI 是否呼叫了 `searchWeb` 工具?
   - [ ] 回應是否以「根據搜尋結果...」開頭?
   - [ ] 是否提到「Neko no Suzumi」或「貓咪納涼圖」?
   - [ ] 是否說明這是日本藝術作品而非貓咪品種?
   - [ ] **沒有**說「查不到資訊」?
   - [ ] **沒有**洩露內部推理 (如 "According to tool guidelines")?

---

## 🎯 測試方法 B: Mock 搜尋測試 (不需要真實搜尋服務)

如果搜尋代理服務未運行,可以用這個方法測試改進的 Prompt 邏輯:

### 1. 創建模擬搜尋腳本

```bash
cat > /tmp/test-search-with-mock.sh << 'EOF'
#!/bin/bash

echo "🧪 Testing AI with mock search results..."

# 直接注入搜尋結果到對話中 (模擬工具執行後的狀態)
curl -k -X POST https://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "can you help me search suzumi cat?"
      },
      {
        "role": "system",
        "content": "╔═══════════════════════════════════════════════════════════╗\n║              收到搜尋結果                                  ║\n╚═══════════════════════════════════════════════════════════╝\n\n📋 searchWeb 工具已回傳以下資訊：\n\n1. Coloring Page: Neko no Suzumi (Cats Enjoying the Cool of Evening)\nHOME / Art / Japanese Fine Arts / Utagawa Kuniyoshi / Coloring Page: Neko no Suzumi (Cats Enjoying the Cool of Evening)\nhttps://example.com/neko-suzumi\n\n╔═══════════════════════════════════════════════════════════╗\n║          ✅ 強制執行指令 ✅                                ║\n╚═══════════════════════════════════════════════════════════╝\n\n你必須遵守以下規則：\n1. 仔細閱讀上方的搜尋結果\n2. 在回覆中引用結果的具體資訊\n3. 若結果看似無關，說明為何可能相關或提出釐清問題\n4. 絕不在上方有提供結果時說「我查不到資訊」\n5. 使用純文字回應 - 不要 JSON、不要呼叫工具\n6. 以「根據搜尋結果...」或類似語句開始你的回應"
      }
    ],
    "language": "zh",
    "modelPreference": "standard"
  }' | jq -r '.data.text'

echo ""
echo "✅ Test completed!"
EOF

chmod +x /tmp/test-search-with-mock.sh
/tmp/test-search-with-mock.sh
```

### 2. 預期改進效果

**改進前** (舊版本):
```
抱歉,我這邊查不到「Suzumi」貓咪相關的資訊。
若您想了解某個貓種或特定貓咪,請再提供一些細節...
```

**改進後** (新版本):
```
根據搜尋結果,我發現「Suzumi」出現在「Neko no Suzumi」(貓咪納涼圖) 中,
這是一幅日本藝術作品,描繪貓咪在夏夜納涼的情景。

這可能是文化典故或藝術作品名稱,而非實際的貓咪品種。
請問你想了解的是:
1. 這幅藝術作品的背景?
2. 某個特定品種的貓咪?
3. 或者是其他與「Suzumi」相關的資訊?
```

---

## 🎯 測試方法 C: 檢查後端日誌

### 觀察關鍵日誌輸出:

```bash
# 查看後端日誌 (在另一個終端)
tail -f /tmp/backend-startup.log | grep -E "search|Search|SEARCH|Injected"
```

### 應該看到的日誌:

```
[INFO] [ai] 收到提問 question=can you help me search suzumi cat?
[INFO] [AI DEBUG] MLX response: hasMessage=true
[INFO] [AI DEBUG] Extracted implicit tool call: tool=searchWeb
[INFO] [chat-stream] tool searchWeb -> success (1019ms)
[INFO] [ai] DEBUG: Keyword match ratio: 2/2 (100.0%)
[INFO] [ai] DEBUG: hasEmptyOrUselessResult = false
[INFO] [ai] Injected formatted search results (3 lines) into conversation  ← 🎯 關鍵!
[INFO] [ai] Search tool executed successfully, will force text response
[INFO] [ai] 產生回覆 preview=根據搜尋結果...  ← 🎯 改進成功!
```

---

## 📊 改進效果檢查清單

### ✅ 基本功能
- [ ] AI 成功呼叫 `searchWeb` 工具
- [ ] 搜尋結果被正確注入到對話中
- [ ] AI 生成了文字回應 (未再次呼叫工具)

### ✅ 核心改進點
- [ ] **引用來源**: 回應包含「根據搜尋結果」或類似語句
- [ ] **具體內容**: 提到「Neko no Suzumi」或「貓咪納涼圖」
- [ ] **正確解讀**: 說明這是藝術作品,不是貓咪品種
- [ ] **不否定結果**: 沒有說「查不到資訊」
- [ ] **無洩露**: 沒有「According to tool guidelines」等內部推理

### ✅ 視覺改進 (檢查日誌)
- [ ] 日誌顯示 `Injected formatted search results`
- [ ] 注入的內容包含 ASCII 邊框
- [ ] 搜尋結果格式化為編號列表

---

## 🚨 常見問題排查

### Q1: AI 沒有呼叫 searchWeb 工具?
**檢查**:
- `enableSearch` 是否設為 `true`?
- MLX 模型是否正常運行?
- 檢查日誌是否有錯誤訊息

**解決**:
```bash
# 檢查模型狀態
curl http://localhost:8080/v1/models
```

### Q2: 搜尋工具執行失敗?
**檢查**:
- 搜尋代理服務是否運行在 `http://127.0.0.1:5858`?
- `.env` 中的 `SMARTCAT_SEARCH_PROXY_URL` 是否正確?

**解決**:
```bash
# 測試搜尋代理
curl "http://127.0.0.1:5858/search?q=test&limit=3"
```

### Q3: AI 仍然說「查不到資訊」?
**可能原因**:
- 後端未重啟,舊代碼仍在運行
- System Prompt 未正確載入

**解決**:
```bash
# 重啟後端
pkill -f "tsx watch"
npm run dev
```

---

## 🎉 預期最終效果

當所有改進生效後,對話應該像這樣:

```
👤 用戶: can you help me search suzumi cat?

🤖 AI (改進後):
根據搜尋結果,我發現「Suzumi」出現在「Neko no Suzumi」（猫の涼み / 貓咪納涼圖）中。
這是日本浮世繪大師歌川國芳的作品,描繪一群貓咪在夏日夜晚乘涼的可愛情景。

這個名稱更可能是指:
1. 日本傳統藝術作品的標題
2. 日式文化中的「納涼」概念 (夏日乘涼)

而非某個貓咪品種。你是想了解這幅畫作的背景,還是在尋找某個特定品種的貓咪呢?
我可以幫你更多！😊
```

---

## 📝 測試記錄

### 測試日期: ___________
### 測試者: ___________

| 檢查項目 | 通過? | 備註 |
|---------|------|------|
| AI 呼叫 searchWeb | ☐ | |
| 引用「根據搜尋結果」 | ☐ | |
| 提到 Neko no Suzumi | ☐ | |
| 說明是藝術作品 | ☐ | |
| 沒說「查不到」 | ☐ | |
| 無內部推理洩露 | ☐ | |
| 視覺格式化 (日誌) | ☐ | |

### 測試結果總評:
□ 完全成功  □ 部分成功  □ 需要調整

### 其他觀察:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**Happy Testing! 🎯**
