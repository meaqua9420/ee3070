# 搜尋工具修復說明

## ✅ 已完成的修復

### 1. 修復系統提示矛盾（`src/ai.ts:1141-1147`）
- **問題**：系統告訴 AI「無法連線」，但同時搜尋工具又可用
- **修復**：改為「使用 searchWeb 工具一次取得資料，然後提供完整回答」

### 2. 強化工具描述（`src/ai.ts:1377-1395`）
- **問題**：工具描述沒有強調「只能呼叫一次」
- **修復**：在描述中明確說明「每次對話只能呼叫此工具一次」

### 3. 搜尋成功後禁用工具（`src/index.ts:5277-5303, 6234-6260`）
- **問題**：搜尋成功後沒有禁用 searchWeb，導致 AI 反復呼叫
- **修復**：搜尋成功後立即設置 `enableSearch = false` 並添加明確停止指令

### 4. 添加工具呼叫格式說明（`src/ai.ts:119-132`）
- **問題**：AI 生成自然語言描述而非結構化工具呼叫
- **修復**：在系統提示中添加「必須使用 OpenAI function calling 格式」的說明

---

## ⚠️ 發現的新問題

### 問題：Pro 模型連線失敗

從日誌可以看到：
```
[ai] pro model failed with reasoning enabled (fetch failed), retrying without reasoning.
[ai] Pro model failed, falling back to standard: fetch failed
```

**原因**：Pro 模型服務器無法連接，回退到 Standard 模型

**診斷步驟**：

1. **檢查 Pro 模型是否運行**
   ```bash
   # 檢查 Pro 模型服務是否啟動
   curl http://127.0.0.1:18181/v1/models
   # 或檢查環境變量中配置的 URL
   ```

2. **檢查環境變量配置**
   ```bash
   cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
   grep "LOCAL_LLM_PRO" .env
   ```

   應該包含類似：
   ```
   LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18181
   LOCAL_LLM_PRO_MODEL_ID=your-pro-model-name
   ```

3. **檢查 Standard 模型的工具呼叫支持**
   ```bash
   # 測試 Standard 模型是否支持工具呼叫
   curl http://127.0.0.1:18181/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "your-standard-model",
       "messages": [{"role": "user", "content": "請幫我搜尋貓咪飲水量"}],
       "tools": [{"type": "function", "function": {"name": "searchWeb", "description": "搜尋網頁"}}],
       "tool_choice": "auto"
     }'
   ```

---

## 🔧 解決方案

### 方案 A：修復 Pro 模型連接（推薦）

Pro 模型通常對工具呼叫的支持更好。請確保：

1. Pro 模型服務正在運行
2. `.env` 文件中配置正確：
   ```bash
   LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18181
   LOCAL_LLM_PRO_MODEL_ID=gpt-oss-20b-GGUF  # 或其他支持工具呼叫的模型
   LOCAL_LLM_PRO_ENABLE_THINKING=true
   ```

3. 重啟後端服務：
   ```bash
   npm run dev
   ```

### 方案 B：如果 Pro 模型不可用

如果 Pro 模型無法使用，Standard 模型可能不支持工具呼叫。此時有兩個選擇：

**選項 1**: 使用相同的模型作為 Pro
```bash
# 在 .env 中
LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18181
LOCAL_LLM_PRO_MODEL_ID=<與 standard 相同的模型>
```

**選項 2**: 禁用搜尋功能
前端關閉搜尋開關，使用本地知識庫

---

## 🧪 測試修復效果

修復完成後，請測試：

1. **啟動後端**
   ```bash
   cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
   npm run dev
   ```

2. **測試搜尋功能**
   - 前端啟用搜尋開關
   - 切換到 Pro 模型
   - 詢問：「請幫我上網查貓咪每天需要喝多少水」

3. **檢查日誌**
   應該看到：
   ```
   [chat-stream] tool searchWeb -> success
   🔎 搜尋完成。結果：...
   ✅ 重要：請立即使用以上搜尋結果回答使用者問題。禁止再次呼叫 searchWeb。
   ```

4. **驗證只呼叫一次**
   - 檢查 toolEvents 中 searchWeb 的呼叫次數應該 = 1
   - AI 不應該再次請求搜尋

---

## 📝 技術細節

### 修復原理

1. **移除矛盾信號**: 不再告訴 AI「無法連線」
2. **明確指令**: 多處強調「只能呼叫一次」
3. **動態禁用**: 搜尋成功後從工具列表中移除 searchWeb
4. **格式說明**: 明確告知 AI 使用 tool_calls 格式

### 代碼變更摘要

- `src/ai.ts:119-132`: 添加工具呼叫格式說明
- `src/ai.ts:1141-1147`: 修改搜尋提示
- `src/ai.ts:1382-1383`: 強化工具描述
- `src/index.ts:5277-5303`: 非 streaming endpoint 修復
- `src/index.ts:6234-6260`: Streaming endpoint 修復

---

## 💡 下一步

如果問題仍然存在：

1. 檢查模型是否支持 OpenAI function calling 格式
2. 考慮升級到支持工具呼叫的模型（如 Qwen2.5 或更新版本）
3. 檢查 MLX 服務器是否正確處理 `tools` 和 `tool_choice` 參數

需要更多幫助請查看日誌中的具體錯誤信息！
