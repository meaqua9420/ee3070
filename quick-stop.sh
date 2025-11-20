#!/bin/bash
# 🛑 Smart Cat Home - 快速停止脚本 / Quick Stop Script

set -e

echo "🛑 停止 Smart Cat Home 服务..."
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 从 PID 文件停止
if [ -f "backend.pid" ]; then
  BACKEND_PID=$(cat backend.pid)
  echo "停止后端 (PID: $BACKEND_PID)..."
  kill $BACKEND_PID 2>/dev/null || echo -e "${YELLOW}后端进程已不存在${NC}"
  rm backend.pid
else
  echo -e "${YELLOW}未找到后端 PID 文件${NC}"
fi

if [ -f "frontend.pid" ]; then
  FRONTEND_PID=$(cat frontend.pid)
  echo "停止前端 (PID: $FRONTEND_PID)..."
  kill $FRONTEND_PID 2>/dev/null || echo -e "${YELLOW}前端进程已不存在${NC}"
  rm frontend.pid
else
  echo -e "${YELLOW}未找到前端 PID 文件${NC}"
fi

# 强制清理端口
echo ""
echo "清理端口..."
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ 服务已停止${NC}"
