#!/bin/bash

# 🧪 測試改進後的搜尋功能
# Test improved search functionality

echo "═══════════════════════════════════════════════════════════"
echo "  🔍 Testing Improved Search Function  "
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 Test Case: Search for 'suzumi cat'"
echo "Expected: AI should cite the search results and explain relevance"
echo ""
echo "⏳ Sending request..."
echo ""

# 測試請求 (與原 log 相同的查詢)
curl -k -X POST https://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "message": "can you help me search suzumi cat?（本輪啟用聯網搜尋，請務必先呼叫 searchWeb 工具檢索後再回答，若搜尋失敗請明確說明原因。）",
    "language": "zh",
    "enableSearch": true,
    "modelPreference": "standard"
  }' 2>&1 | tee /tmp/search-test-result.json | head -100

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Test completed!"
echo ""
echo "📊 Results summary:"
echo "  - Full output saved to: /tmp/search-test-result.json"
echo ""
echo "🔍 Key improvements to verify:"
echo "  1. ✅ AI should cite 'Neko no Suzumi' from search results"
echo "  2. ✅ AI should explain it's a Japanese artwork (not claim 'no info found')"
echo "  3. ✅ No internal reasoning should leak (no 'According to tool guidelines...')"
echo "  4. ✅ Response should start with '根據搜尋結果' or similar"
echo ""
echo "═══════════════════════════════════════════════════════════"
