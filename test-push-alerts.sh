#!/bin/bash
# 推播通知診斷測試腳本
# 用於測試實際警報是否能推送到訂閱端

echo "🔔 Smart Cat Home - 推播通知診斷測試"
echo "========================================"
echo ""

# 檢查後端運行狀態
echo "📡 1. 檢查後端服務..."
if lsof -i :4000 | grep -q LISTEN; then
    echo "✅ 後端正在運行 (port 4000)"
else
    echo "❌ 後端未運行！請先啟動後端"
    exit 1
fi
echo ""

# 檢查推播訂閱數量
echo "📱 2. 檢查推播訂閱..."
SUB_COUNT=$(sqlite3 /Users/meaqua/Desktop/EE3070/smart-cat-backend/smart-cat-home.db "SELECT COUNT(*) FROM push_subscriptions;" 2>/dev/null || echo "0")
echo "   訂閱數量: $SUB_COUNT"
if [ "$SUB_COUNT" -eq "0" ]; then
    echo "⚠️  警告: 沒有推播訂閱！請先在前端啟用通知"
fi
echo ""

# 檢查最近的警報
echo "⚠️  3. 檢查最近的 warning/critical 警報..."
sqlite3 /Users/meaqua/Desktop/EE3070/smart-cat-backend/smart-cat-home.db \
    "SELECT datetime(timestamp), severity, substr(message, 1, 40) || '...'
     FROM automation_alerts
     WHERE severity IN ('warning', 'critical')
     ORDER BY timestamp DESC
     LIMIT 5;" \
    2>/dev/null | while read line; do
    echo "   $line"
done
echo ""

# 檢查 VAPID 配置
echo "🔑 4. 檢查 VAPID 配置..."
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
if grep -q "VAPID_PUBLIC_KEY=B" .env 2>/dev/null; then
    echo "✅ VAPID_PUBLIC_KEY 已配置"
else
    echo "❌ VAPID_PUBLIC_KEY 未配置或為空"
fi

if grep -q "VAPID_PRIVATE_KEY=" .env 2>/dev/null && grep "VAPID_PRIVATE_KEY=" .env | grep -qv "VAPID_PRIVATE_KEY=$"; then
    echo "✅ VAPID_PRIVATE_KEY 已配置"
else
    echo "❌ VAPID_PRIVATE_KEY 未配置或為空"
fi
echo ""

# 檢查前端 VAPID 配置
echo "🌐 5. 檢查前端 VAPID 配置..."
cd /Users/meaqua/Desktop/EE3070/smart-cat-home
if grep -q "VITE_VAPID_PUBLIC_KEY=B" .env.local 2>/dev/null; then
    FRONTEND_KEY=$(grep "VITE_VAPID_PUBLIC_KEY=" .env.local | cut -d'=' -f2)
    BACKEND_KEY=$(grep "VAPID_PUBLIC_KEY=" ../smart-cat-backend/.env | cut -d'=' -f2)
    if [ "$FRONTEND_KEY" = "$BACKEND_KEY" ]; then
        echo "✅ 前後端 VAPID 公鑰一致"
    else
        echo "❌ 前後端 VAPID 公鑰不一致！"
        echo "   前端: ${FRONTEND_KEY:0:20}..."
        echo "   後端: ${BACKEND_KEY:0:20}..."
    fi
else
    echo "❌ 前端 VITE_VAPID_PUBLIC_KEY 未配置"
fi
echo ""

# 發送測試推播 (通過後端 API)
echo "🧪 6. 發送後端測試推播..."
echo "   請注意：此測試需要登入狀態，可能會失敗"
RESPONSE=$(curl -s -X POST http://localhost:4000/api/push/test 2>&1)
if echo "$RESPONSE" | grep -q "ok.*true"; then
    echo "✅ 測試推播請求已發送"
else
    echo "⚠️  測試推播請求可能失敗 (需要登入)"
    echo "   響應: ${RESPONSE:0:100}"
fi
echo ""

# 模擬警報觸發
echo "💧 7. 模擬水位警報 (brightness < 15%)..."
echo "   方法: 發送模擬 snapshot 到後端"
cat > /tmp/test-snapshot.json <<'EOF'
{
  "temperature": 25.0,
  "humidity": 60.0,
  "waterLevel": 450,
  "brightness": 8,
  "catWeight": 1.5,
  "timestamp": ""
}
EOF

# 更新時間戳
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
sed -i '' "s/\"timestamp\": \"\"/\"timestamp\": \"$TIMESTAMP\"/" /tmp/test-snapshot.json

echo "   發送模擬數據到後端..."
SNAPSHOT_RESPONSE=$(curl -s -X POST http://localhost:4000/api/snapshots \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HARDWARE_API_KEY:-test-key}" \
    -d @/tmp/test-snapshot.json 2>&1)

if echo "$SNAPSHOT_RESPONSE" | grep -q "ok.*true"; then
    echo "✅ 模擬數據已發送，應該觸發警報並推播"
else
    echo "⚠️  模擬數據發送可能失敗"
    echo "   響應: ${SNAPSHOT_RESPONSE:0:150}"
fi
echo ""

# 等待並檢查新警報
echo "⏳ 等待 2 秒..."
sleep 2
echo ""

echo "📊 8. 檢查是否產生新警報..."
LATEST_ALERT=$(sqlite3 /Users/meaqua/Desktop/EE3070/smart-cat-backend/smart-cat-home.db \
    "SELECT datetime(timestamp), severity, message
     FROM automation_alerts
     WHERE timestamp > datetime('now', '-10 seconds')
     ORDER BY timestamp DESC
     LIMIT 1;" 2>/dev/null)

if [ -n "$LATEST_ALERT" ]; then
    echo "✅ 發現新警報:"
    echo "   $LATEST_ALERT"
    echo ""
    echo "📱 請檢查您的手機/瀏覽器是否收到推播通知！"
else
    echo "⚠️  未發現新警報（可能已有冷卻期或閾值未達到）"
fi
echo ""

echo "========================================"
echo "✅ 診斷完成！"
echo ""
echo "📌 問題排查提示："
echo "   1. 如果測試通知可以收到，但實際警報不行："
echo "      - 檢查警報嚴重度是否為 warning 或 critical"
echo "      - 檢查是否在 5 分鐘冷卻期內"
echo "   "
echo "   2. 如果什麼通知都收不到："
echo "      - 重新點擊「通知已啟用」按鈕重設訂閱"
echo "      - 檢查瀏覽器/手機的通知權限"
echo "      - 檢查 Service Worker 是否正常運行"
echo ""
echo "   3. 查看後端日誌："
echo "      - 查找 [push] 或 [alert] 相關的錯誤訊息"
echo ""
