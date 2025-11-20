#!/bin/bash
# 🚀 Smart Cat Home - 快速启动脚本 / Quick Start Script
# 用法 / Usage: ./quick-start.sh

set -e

echo "🐱 Smart Cat Home - 快速启动 / Quick Start"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Node.js
echo "🔍 检查环境 / Checking environment..."
node --version || { echo -e "${RED}❌ Node.js 未安装${NC}"; exit 1; }
npm --version || { echo -e "${RED}❌ npm 未安装${NC}"; exit 1; }
echo -e "${GREEN}✅ Node.js 和 npm 已就绪${NC}"
echo ""

# 检查端口占用
echo "🔍 检查端口占用 / Checking ports..."
if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  端口 4000 已被占用，正在终止进程...${NC}"
  lsof -ti:4000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  端口 5173 已被占用，正在终止进程...${NC}"
  lsof -ti:5173 | xargs kill -9 2>/dev/null || true
  sleep 1
fi
echo -e "${GREEN}✅ 端口已清理${NC}"
echo ""

# 启动后端
echo "🚀 启动后端 / Starting backend..."
cd "$(dirname "$0")/smart-cat-backend"

# 检查构建产物
if [ ! -d "dist" ]; then
  echo -e "${YELLOW}⚠️  dist 目录不存在，正在构建...${NC}"
  npm run build || { echo -e "${RED}❌ 后端构建失败${NC}"; exit 1; }
fi

# 后台启动后端
echo "   启动后端服务（端口 4000）..."
nohup npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ 后端已启动 (PID: $BACKEND_PID)${NC}"
echo "   日志文件: backend.log"
echo ""

# 等待后端就绪
echo "⏳ 等待后端就绪..."
for i in {1..30}; do
  if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 后端已就绪！${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ 后端启动超时，请检查 backend.log${NC}"
    exit 1
  fi
  sleep 1
done
echo ""

# 启动前端
echo "🚀 启动前端 / Starting frontend..."
cd ../smart-cat-home

echo "   启动开发服务器（端口 5173）..."
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✅ 前端已启动 (PID: $FRONTEND_PID)${NC}"
echo "   日志文件: frontend.log"
echo ""

# 等待前端就绪
echo "⏳ 等待前端就绪..."
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 前端已就绪！${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${YELLOW}⚠️  前端启动较慢，请检查 frontend.log${NC}"
  fi
  sleep 1
done
echo ""

# 完成
echo "=========================================="
echo -e "${GREEN}🎉 启动完成！ / Startup Complete!${NC}"
echo ""
echo "📱 前端地址: http://localhost:5173"
echo "🔧 后端地址: http://localhost:4000"
echo ""
echo "📋 命令 / Commands:"
echo "  查看后端日志: tail -f backend.log"
echo "  查看前端日志: tail -f frontend.log"
echo "  停止服务: ./quick-stop.sh"
echo ""
echo "🐛 调试信息 / Debug Info:"
echo "  后端 PID: $BACKEND_PID"
echo "  前端 PID: $FRONTEND_PID"
echo ""

# 保存 PID
echo "$BACKEND_PID" > ../backend.pid
echo "$FRONTEND_PID" > ../frontend.pid

# 询问是否打开浏览器
read -p "是否打开浏览器？(y/n) Open browser? " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null || echo "请手动打开 http://localhost:5173"
fi
