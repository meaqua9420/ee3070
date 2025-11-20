#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     🧪 Testing Improved AI Search Function               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 測試 1: 檢查搜尋代理服務
echo "📡 Step 1: Checking search proxy service..."
if curl -s http://127.0.0.1:5858/health > /dev/null 2>&1; then
    echo "   ✅ Search proxy is running"
else
    echo "   ❌ Search proxy is NOT running"
    echo "   💡 Please start the search proxy first"
    exit 1
fi
echo ""

# 測試 2: 測試搜尋代理本身
echo "🔍 Step 2: Testing search proxy directly..."
PROXY_RESULT=$(curl -s "http://127.0.0.1:5858/search?q=suzumi+cat&limit=3" 2>&1)
if echo "$PROXY_RESULT" | grep -q "results\|title\|snippet"; then
    echo "   ✅ Search proxy returns results"
    echo "   📋 Sample output:"
    echo "$PROXY_RESULT" | head -10
else
    echo "   ❌ Search proxy returned unexpected format"
    echo "   Output: $PROXY_RESULT"
fi
echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""

# 測試 3: 測試 AI 聊天端點
echo "🤖 Step 3: Testing AI chat with search enabled..."
echo "   Query: 'can you help me search suzumi cat?'"
echo "   Language: Chinese (zh)"
echo "   Search: Enabled"
echo ""
echo "   ⏳ Sending request (this may take 30-60 seconds)..."
echo ""

RESPONSE=$(curl -k -X POST https://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "message": "can you help me search suzumi cat?",
    "language": "zh",
    "enableSearch": true,
    "modelPreference": "standard"
  }' 2>&1)

echo "   ✅ Response received!"
echo ""

# 解析回應
TEXT=$(echo "$RESPONSE" | jq -r '.data.text' 2>/dev/null)
TOOL_EVENTS=$(echo "$RESPONSE" | jq -r '.data.toolEvents' 2>/dev/null)

echo "─────────────────────────────────────────────────────────────"
echo "📊 Test Results Analysis"
echo "─────────────────────────────────────────────────────────────"
echo ""

# 檢查 1: 是否呼叫了 searchWeb 工具
if echo "$TOOL_EVENTS" | grep -q "searchWeb"; then
    echo "✅ CHECK 1: AI called searchWeb tool"
else
    echo "❌ CHECK 1: AI did NOT call searchWeb tool"
fi

# 檢查 2: 是否引用了搜尋結果
if echo "$TEXT" | grep -Eq "根據搜尋結果|搜尋結果|search result"; then
    echo "✅ CHECK 2: AI cited search results"
else
    echo "❌ CHECK 2: AI did NOT cite search results"
fi

# 檢查 3: 是否提到 Suzumi/Neko
if echo "$TEXT" | grep -Eiq "suzumi|neko|納涼"; then
    echo "✅ CHECK 3: AI mentioned relevant content (Suzumi/Neko)"
else
    echo "❌ CHECK 3: AI did NOT mention search content"
fi

# 檢查 4: 是否說「查不到資訊」
if echo "$TEXT" | grep -Eq "查不到|找不到|沒有.*資訊"; then
    echo "❌ CHECK 4: AI incorrectly said 'no information found'"
else
    echo "✅ CHECK 4: AI did NOT claim 'no info' (good!)"
fi

# 檢查 5: 是否洩露內部推理
if echo "$TEXT" | grep -Eq "According to.*tool|tool guidelines|internal"; then
    echo "❌ CHECK 5: Internal reasoning leaked"
else
    echo "✅ CHECK 5: No internal reasoning leaked"
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "📝 Full AI Response:"
echo "─────────────────────────────────────────────────────────────"
echo "$TEXT"
echo ""
echo "─────────────────────────────────────────────────────────────"
echo "🔧 Tool Events:"
echo "─────────────────────────────────────────────────────────────"
echo "$TOOL_EVENTS" | jq '.' 2>/dev/null || echo "$TOOL_EVENTS"
echo ""

# 保存完整結果
echo "$RESPONSE" > /tmp/search-test-full-result.json
echo "💾 Full response saved to: /tmp/search-test-full-result.json"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Test completed!"
echo "═══════════════════════════════════════════════════════════"
