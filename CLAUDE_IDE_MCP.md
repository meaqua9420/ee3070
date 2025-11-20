## 將 Codex 與 Claude Code IDE 串接

Smart Cat Backend 內建 `mcp.claude.ideCommand`，可以透過 MCP 向本機 Claude Code CLI 發送 prompt。以下是讓 Codex 工作時能呼叫 Claude IDE 的步驟：

### 1. 準備環境
1. 安裝並登入 Claude Code CLI（`claude`）。  
2. 在後端 `.env` 設定（若 CLI 不在預設路徑）：
   ```bash
   CLAUDE_CLI_BIN=/path/to/claude
   ```
3. 啟動 backend：`npm run dev`。

### 2. 確認 MCP 工具
`smart-cat-backend/mcp-tools.json` 已包含：
```json
{
  "type": "function",
  "function": {
    "name": "mcp.claude.ideCommand",
    "description": "透過本機 Claude Code CLI (-\\-print) 與 IDE 溝通。",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string" },
        "cwd": { "type": "string" },
        "model": { "type": "string" },
        "ide": { "type": "boolean" },
        "systemPrompt": { "type": "string" },
        "appendSystemPrompt": { "type": "string" },
        "outputFormat": { "type": "string", "enum": ["text", "json"] },
        "timeoutMs": { "type": "number" },
        "allowDangerouslySkipPermissions": { "type": "boolean" },
        "extraArgs": { "type": "array", "items": { "type": "string" } },
        "lang": { "type": "string", "enum": ["zh", "en"] }
      },
      "required": ["prompt"]
    }
  }
}
```

### 3. 在 Codex CLI 加入 MCP 設定
以 `~/.codex/mcp.json` 為例：
已附上一份範例 `codex-mcp.config.json`（在 repo 根目錄）。可直接複製到 `~/.codex/mcp.json` 或以 `--mcp-config /path/to/codex-mcp.config.json` 載入：
```bash
cp codex-mcp.config.json ~/.codex/mcp.json
codex --mcp-config ~/.codex/mcp.json
```

### 4. 測試呼叫
可直接打 API：
```bash
curl -s http://127.0.0.1:4000/mcp/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "tool": "mcp.claude.ideCommand",
    "args": {
      "prompt": "請幫我檢查 src/components/AiChatPanel.tsx 的 useEffect 依賴是否正確",
      "cwd": "/Users/you/EE3070",
      "ide": true,
      "outputFormat": "text",
      "timeoutMs": 120000
    }
  }'
```

### 5. 在 Codex 任務中使用
當 Codex 需要與 Claude 討論：
```json
{
  "tool": "mcp.claude.ideCommand",
  "args": {
    "prompt": "掃描 useToast hook 是否有 race condition，請給修正提案",
    "cwd": "<repo-root>",
    "ide": true,
    "outputFormat": "json",
    "allowDangerouslySkipPermissions": false
  }
}
```
回傳資料包含 Claude 的輸出、stdout/stderr 與 CLI 參數，Codex 可以據此採納建議或再繼續互動。

> **注意**：`allowDangerouslySkipPermissions` 預設 false，若希望 Claude 自動修改檔案需自行確認安全性後設為 true。
