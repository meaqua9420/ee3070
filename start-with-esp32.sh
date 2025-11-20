#!/bin/bash
# 🚀 ESP32 + 前后端一键启动脚本（增强版）

echo "🎥 ESP32-S3 CAM + Smart Cat Home"
echo "==============================="
echo ""

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# 路径
BASE_DIR="/Users/meaqua/Desktop/EE3070"
BACKEND_DIR="$BASE_DIR/smart-cat-backend"
FRONTEND_DIR="$BASE_DIR/smart-cat-home"

# ✅ 步骤 1: 检查端口占用
echo -e "${BLUE}🔍 检查端口占用...${NC}"

if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${RED}❌ 端口 4000 已被占用${NC}"
  echo "   运行以下命令查看占用进程:"
  echo "   lsof -i :4000"
  echo ""
  read -p "是否强制停止占用进程？(y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在停止占用端口 4000 的进程..."
    lsof -ti :4000 | xargs kill -9 2>/dev/null
    sleep 1
  else
    exit 1
  fi
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${RED}❌ 端口 5173 已被占用${NC}"
  echo "   运行以下命令查看占用进程:"
  echo "   lsof -i :5173"
  echo ""
  read -p "是否强制停止占用进程？(y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在停止占用端口 5173 的进程..."
    lsof -ti :5173 | xargs kill -9 2>/dev/null
    sleep 1
  else
    exit 1
  fi
fi

echo -e "${GREEN}✅ 端口检查通过${NC}"
echo ""

# ✅ 步骤 2: 构建并启动后端
echo -e "${BLUE}📦 构建后端...${NC}"
cd "$BACKEND_DIR"

# 构建，保存输出到日志
if ! npm run build > "$BASE_DIR/backend-build.log" 2>&1; then
  echo -e "${RED}❌ 后端构建失败！${NC}"
  echo "   查看日志: cat $BASE_DIR/backend-build.log"
  echo ""
  echo "最后 20 行错误:"
  tail -20 "$BASE_DIR/backend-build.log"
  exit 1
fi

echo -e "${GREEN}✅ 后端构建成功${NC}"
echo ""

# 启动后端
echo -e "${BLUE}🚀 启动后端...${NC}"
npm start > "$BASE_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BASE_DIR/backend.pid"
echo -e "${GREEN}✅ 后端已启动 (PID: $BACKEND_PID)${NC}"
echo "   日志: $BASE_DIR/backend.log"
echo ""

# ✅ 步骤 3: 等待后端就绪（健康检查）
echo -e "${BLUE}⏳ 等待后端就绪...${NC}"
BACKEND_READY=false
for i in {1..30}; do
  # 检查进程是否还活着
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ 后端进程已退出${NC}"
    echo "   查看日志: tail -50 $BASE_DIR/backend.log"
    exit 1
  fi

  # 尝试连接健康检查端点
  if curl -s http://localhost:4000 >/dev/null 2>&1; then
    BACKEND_READY=true
    break
  fi

  echo -n "."
  sleep 1
done
echo ""

if [ "$BACKEND_READY" = false ]; then
  echo -e "${RED}❌ 后端启动超时（30秒）${NC}"
  echo "   查看日志: tail -50 $BASE_DIR/backend.log"
  echo ""
  echo "最后 20 行日志:"
  tail -20 "$BASE_DIR/backend.log"
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi

echo -e "${GREEN}✅ 后端已就绪${NC}"
echo ""

# ✅ 步骤 4: 启动前端
echo -e "${BLUE}🎨 启动前端...${NC}"
cd "$FRONTEND_DIR"

npm run dev > "$BASE_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$BASE_DIR/frontend.pid"
echo -e "${GREEN}✅ 前端已启动 (PID: $FRONTEND_PID)${NC}"
echo "   日志: $BASE_DIR/frontend.log"
echo ""

# ✅ 步骤 5: 等待前端就绪（健康检查）
echo -e "${BLUE}⏳ 等待前端就绪...${NC}"
FRONTEND_READY=false
for i in {1..30}; do
  # 检查进程是否还活着
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}❌ 前端进程已退出${NC}"
    echo "   查看日志: tail -50 $BASE_DIR/frontend.log"
    kill $BACKEND_PID 2>/dev/null
    exit 1
  fi

  # 尝试连接前端
  if curl -s http://localhost:5173 >/dev/null 2>&1; then
    FRONTEND_READY=true
    break
  fi

  echo -n "."
  sleep 1
done
echo ""

if [ "$FRONTEND_READY" = false ]; then
  echo -e "${RED}❌ 前端启动超时（30秒）${NC}"
  echo "   查看日志: tail -50 $BASE_DIR/frontend.log"
  echo ""
  echo "最后 20 行日志:"
  tail -20 "$BASE_DIR/frontend.log"
  kill $FRONTEND_PID 2>/dev/null
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi

echo -e "${GREEN}✅ 前端已就绪${NC}"
echo ""

# ✅ 成功启动
echo "=========================================="
echo -e "${GREEN}🎉 所有服务已成功启动！${NC}"
echo "=========================================="
echo ""
echo "📱 使用步骤："
echo ""
echo "1️⃣  连接到 ESP32 WiFi"
echo "   • Mac: WiFi 设置 → 选择 ESP32-CAM"
echo "   • 或运行: bash manage-esp32-wifi.sh"
echo ""
echo "2️⃣  打开浏览器"
echo "   ${BLUE}http://localhost:5173${NC}"
echo ""
echo "3️⃣  查找 'ESP32-S3 摄像头' 面板"
echo "   • 点击 📷 拍摄照片"
echo "   • 启用自动刷新 (可选)"
echo "   • 点击 ⚙️ 自定义 ESP32 地址和刷新间隔"
echo ""
echo "=========================================="
echo ""
echo "🔧 服务信息："
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:4000"
echo "   ESP32: http://192.168.5.1 (默认，可在前端修改)"
echo ""
echo "📋 管理命令："
echo "   查看后端日志: tail -f $BASE_DIR/backend.log"
echo "   查看前端日志: tail -f $BASE_DIR/frontend.log"
echo "   停止服务: bash quick-stop.sh"
echo "   或手动停止:"
echo "     kill $BACKEND_PID  # 停止后端"
echo "     kill $FRONTEND_PID  # 停止前端"
echo ""
echo "💡 提示："
echo "   • 连接 ESP32 WiFi 后，localhost 仍然可用"
echo "   • 拍摄的照片可以下载保存"
echo "   • 如需互联网，切换回家庭 WiFi"
echo "   • 首次使用请点击前端右上角 ⚙️ 配置 ESP32 地址"
echo ""

# 询问是否打开浏览器
read -p "是否自动打开浏览器？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "⏳ 打开浏览器..."
  sleep 1
  open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null
  echo -e "${GREEN}✅ 浏览器已打开${NC}"
fi

echo ""
echo "👋 按 Ctrl+C 不会停止服务，使用 bash quick-stop.sh 停止"
echo ""
