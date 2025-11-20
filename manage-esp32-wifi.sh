#!/bin/bash
# 🎥 ESP32-S3 CAM WiFi 自动切换脚本
# ESP32-S3 CAM WiFi Auto-Switch Script

echo "🎥 ESP32-S3 CAM WiFi 管理工具"
echo "=============================="
echo ""

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 配置
ESP32_SSID="ESP32-CAM"        # 你的 ESP32 WiFi 名称（根据实际情况修改）
ESP32_PASSWORD=""             # ESP32 WiFi 密码（如果有）
HOME_SSID="YourHomeWiFi"      # 你的家庭 WiFi 名称
BACKEND_PATH="/Users/meaqua/Desktop/EE3070/smart-cat-backend"
FRONTEND_PATH="/Users/meaqua/Desktop/EE3070/smart-cat-home"

function show_menu() {
  echo ""
  echo "请选择操作："
  echo "1. 连接到 ESP32-S3 CAM WiFi（拍摄照片）"
  echo "2. 切换回家庭 WiFi（恢复互联网）"
  echo "3. 测试 ESP32 连接"
  echo "4. 配置后端使用 ESP32"
  echo "5. 启动前后端服务"
  echo "6. 查看当前 WiFi"
  echo "0. 退出"
  echo ""
  read -p "输入选项 [0-6]: " choice
}

function get_current_wifi() {
  /System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk '/ SSID/ {print $2}'
}

function connect_esp32() {
  echo -e "${YELLOW}🔄 正在连接到 ESP32-S3 CAM...${NC}"

  if [ -z "$ESP32_PASSWORD" ]; then
    networksetup -setairportnetwork en0 "$ESP32_SSID"
  else
    networksetup -setairportnetwork en0 "$ESP32_SSID" "$ESP32_PASSWORD"
  fi

  sleep 3

  current=$(get_current_wifi)
  if [ "$current" = "$ESP32_SSID" ]; then
    echo -e "${GREEN}✅ 已连接到 ESP32-S3 CAM${NC}"
    echo -e "${YELLOW}⚠️  注意：互联网已断开${NC}"
    echo ""
    echo "📷 你现在可以："
    echo "   - 浏览器访问: http://192.168.5.1"
    echo "   - 运行测试: node test-esp32-cam.js"
    echo "   - 拍摄照片: curl -o photo.jpg http://192.168.5.1/capture"
  else
    echo -e "${RED}❌ 连接失败${NC}"
  fi
}

function connect_home() {
  echo -e "${YELLOW}🔄 正在连接到家庭 WiFi...${NC}"

  networksetup -setairportnetwork en0 "$HOME_SSID"

  sleep 3

  current=$(get_current_wifi)
  if [ "$current" = "$HOME_SSID" ]; then
    echo -e "${GREEN}✅ 已恢复互联网连接${NC}"
  else
    echo -e "${RED}❌ 连接失败${NC}"
  fi
}

function test_esp32() {
  echo -e "${YELLOW}🔍 测试 ESP32 连接...${NC}"
  echo ""

  current=$(get_current_wifi)
  if [ "$current" != "$ESP32_SSID" ]; then
    echo -e "${RED}❌ 未连接到 ESP32 WiFi${NC}"
    echo "   当前 WiFi: $current"
    echo "   请先选择选项 1 连接到 ESP32"
    return
  fi

  echo "测试端点："

  # 测试主页
  echo -n "  http://192.168.5.1/ ... "
  if curl -s --max-time 3 http://192.168.5.1/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 可访问${NC}"
  else
    echo -e "${RED}❌ 无响应${NC}"
  fi

  # 测试 /capture
  echo -n "  http://192.168.5.1/capture ... "
  if curl -s --max-time 5 -o /tmp/test_capture.jpg http://192.168.5.1/capture 2>&1 | grep -q "200"; then
    size=$(wc -c < /tmp/test_capture.jpg)
    if [ $size -gt 1000 ]; then
      echo -e "${GREEN}✅ 成功 (${size} bytes)${NC}"
      echo "     照片已保存到: /tmp/test_capture.jpg"
      echo "     查看: open /tmp/test_capture.jpg"
    else
      echo -e "${YELLOW}⚠️  响应但数据异常${NC}"
    fi
  else
    echo -e "${RED}❌ 失败${NC}"
  fi

  # 测试 /snapshot
  echo -n "  http://192.168.5.1/snapshot ... "
  if curl -s --max-time 5 -o /tmp/test_snapshot.jpg http://192.168.5.1/snapshot 2>&1 | grep -q "200"; then
    size=$(wc -c < /tmp/test_snapshot.jpg)
    if [ $size -gt 1000 ]; then
      echo -e "${GREEN}✅ 成功 (${size} bytes)${NC}"
    else
      echo -e "${YELLOW}⚠️  响应但数据异常${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️  不可用（可能不支持此端点）${NC}"
  fi

  # 测试 /stream
  echo -n "  http://192.168.5.1/stream ... "
  if curl -s --max-time 2 http://192.168.5.1/stream > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 视频流可用${NC}"
  else
    echo -e "${YELLOW}⚠️  不可用（可能不支持此端点）${NC}"
  fi
}

function configure_backend() {
  echo -e "${YELLOW}🔧 配置后端...${NC}"
  echo ""

  if [ ! -f "$BACKEND_PATH/.env" ]; then
    echo -e "${RED}❌ 未找到 .env 文件${NC}"
    return
  fi

  # 备份
  cp "$BACKEND_PATH/.env" "$BACKEND_PATH/.env.backup.$(date +%s)"

  # 更新配置
  sed -i '' 's|^CAMERA_BASE_URL=.*|CAMERA_BASE_URL=http://192.168.5.1|' "$BACKEND_PATH/.env"
  sed -i '' 's|^CAMERA_SNAPSHOT_PATH=.*|CAMERA_SNAPSHOT_PATH=/capture|' "$BACKEND_PATH/.env"

  echo -e "${GREEN}✅ 后端配置已更新${NC}"
  echo ""
  echo "配置内容："
  echo "  CAMERA_BASE_URL=http://192.168.5.1"
  echo "  CAMERA_SNAPSHOT_PATH=/capture"
  echo ""
  echo "💡 提示：后端需要在连接到 ESP32 WiFi 时才能拉取照片"
}

function start_services() {
  echo -e "${YELLOW}🚀 启动服务...${NC}"
  echo ""

  current=$(get_current_wifi)
  if [ "$current" = "$ESP32_SSID" ]; then
    echo -e "${RED}⚠️  警告：当前连接到 ESP32 WiFi${NC}"
    echo "   前后端可以启动，但无法访问互联网"
    echo "   建议："
    echo "   1. 先连接家庭 WiFi（选项 2）"
    echo "   2. 启动前后端"
    echo "   3. 需要拍照时再切换到 ESP32"
    echo ""
    read -p "是否继续？(y/n) " confirm
    if [ "$confirm" != "y" ]; then
      return
    fi
  fi

  echo "启动后端..."
  cd "$BACKEND_PATH"
  npm run build && npm start &
  BACKEND_PID=$!

  sleep 3

  echo "启动前端..."
  cd "$FRONTEND_PATH"
  npm run dev &
  FRONTEND_PID=$!

  echo ""
  echo -e "${GREEN}✅ 服务已启动${NC}"
  echo "   后端 PID: $BACKEND_PID"
  echo "   前端 PID: $FRONTEND_PID"
  echo ""
  echo "访问:"
  echo "   前端: http://localhost:5173"
  echo "   后端: http://localhost:4000"
}

function show_current_wifi() {
  current=$(get_current_wifi)
  echo ""
  echo -e "当前 WiFi: ${GREEN}$current${NC}"

  if [ "$current" = "$ESP32_SSID" ]; then
    echo -e "${YELLOW}状态: 已连接到 ESP32（无互联网）${NC}"
  elif [ "$current" = "$HOME_SSID" ]; then
    echo -e "${GREEN}状态: 已连接到家庭 WiFi（有互联网）${NC}"
  else
    echo -e "${YELLOW}状态: 其他网络${NC}"
  fi
}

# 主循环
while true; do
  show_menu

  case $choice in
    1)
      connect_esp32
      ;;
    2)
      connect_home
      ;;
    3)
      test_esp32
      ;;
    4)
      configure_backend
      ;;
    5)
      start_services
      ;;
    6)
      show_current_wifi
      ;;
    0)
      echo "👋 再见！"
      exit 0
      ;;
    *)
      echo -e "${RED}无效选项${NC}"
      ;;
  esac

  echo ""
  read -p "按 Enter 继续..."
done
