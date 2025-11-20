#!/bin/bash

# AI 工具循環修復測試腳本
# 用途: 驗證 AI 不會重複調用同一個工具

echo "🧪 AI 工具循環修復測試"
echo "======================="
echo ""

# 檢查後端是否運行
BACKEND_URL="http://localhost:4000"
echo "📡 檢查後端連接: $BACKEND_URL"

if ! curl -s -f "$BACKEND_URL/api/health" > /dev/null 2>&1; then
    echo "❌ 後端未運行!"
    echo "請先啟動後端: cd /Users/meaqua/Desktop/EE3070/smart-cat-backend && npm run dev"
    exit 1
fi

echo "✅ 後端連接成功"
echo ""

# 測試 1: 基本搜尋工具調用
echo "測試 1: 基本搜尋工具調用"
echo "------------------------"
echo "發送搜尋請求..."

RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/chat/suggestions" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "搜尋貓咪飲水需求的資訊",
    "language": "zh",
    "enableSearch": true,
    "modelPreference": "pro"
  }')

echo "回應: $RESPONSE" | head -c 200
echo "..."
echo ""

# 檢查回應中是否包含重複的工具調用
TOOL_COUNT=$(echo "$RESPONSE" | grep -o "searchWeb" | wc -l)
echo "工具調用次數: $TOOL_COUNT"

if [ "$TOOL_COUNT" -le 1 ]; then
    echo "✅ 測試通過: 沒有重複調用工具"
else
    echo "❌ 測試失敗: 檢測到 $TOOL_COUNT 次工具調用"
fi
echo ""

# 測試 2: 檢查後端日誌
echo "測試 2: 檢查後端日誌"
echo "--------------------"
echo "請檢查後端日誌中的關鍵訊息:"
echo "  ✅ 應該看到: '[ai] Search tool executed successfully, will force text response on next iteration'"
echo "  ✅ 應該看到: '[ai] Text response generated after successful search, breaking tool loop'"
echo "  ❌ 不應該看到: 多次 'Executing tool: searchWeb'"
echo ""

# 測試 3: 搜尋失敗處理
echo "測試 3: 搜尋失敗處理"
echo "--------------------"
echo "發送會導致搜尋失敗的請求..."

RESPONSE2=$(curl -s -X POST "$BACKEND_URL/api/chat/suggestions" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "搜尋 XYZNONEXISTENT999 貓咪品種",
    "language": "zh",
    "enableSearch": true
  }')

echo "回應: $RESPONSE2" | head -c 200
echo "..."
echo ""

# 檢查是否有適當的失敗處理
if echo "$RESPONSE2" | grep -q "搜尋\|找不到\|沒有"; then
    echo "✅ 測試通過: 搜尋失敗後提供了適當的回覆"
else
    echo "⚠️  警告: 搜尋失敗回覆可能不夠明確"
fi
echo ""

# 總結
echo "📊 測試總結"
echo "=========="
echo ""
echo "1. 基本搜尋工具調用: $([ "$TOOL_COUNT" -le 1 ] && echo '✅ 通過' || echo '❌ 失敗')"
echo "2. 日誌檢查: 請手動確認"
echo "3. 搜尋失敗處理: 請手動確認回覆內容"
echo ""
echo "建議操作:"
echo "  - 查看後端日誌: tail -f /Users/meaqua/Desktop/EE3070/smart-cat-backend/logs/*.log"
echo "  - 監控即時輸出: cd smart-cat-backend && npm run dev"
echo "  - 使用前端測試: 開啟瀏覽器,進入聊天頁面,啟用搜尋模式並提問"
echo ""
