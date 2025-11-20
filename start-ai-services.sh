#!/bin/bash
# 🤖 Smart Cat Home - AI 服务启动脚本 / AI Services Startup Script
# 用法 / Usage: ./start-ai-services.sh

set -e

echo "🤖 Smart Cat Home - AI 服务启动 / AI Services Startup"
echo "==========================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查 Nexa CLI
echo "🔍 检查 Nexa CLI / Checking Nexa CLI..."
if ! command -v nexa &> /dev/null; then
  echo -e "${RED}❌ Nexa CLI 未安装${NC}"
  echo "请运行: pip install nexaai"
  exit 1
fi
echo -e "${GREEN}✅ Nexa CLI 已就绪${NC}"
echo ""

# 清理旧端口
echo "🔍 检查端口占用 / Checking ports..."
for PORT in 18181 18182 18183; do
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 $PORT 已被占用，正在终止进程...${NC}"
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done
echo -e "${GREEN}✅ 端口已清理${NC}"
echo ""

# 创建日志目录
mkdir -p /tmp/claude/smart-cat-logs

# 启动 Standard Chat Model (18181)
echo "🚀 启动 Standard Chat Model (Qwen3-4B-Thinking)..."
echo "   端口: 18181"
nohup nexa serve NexaAI/Qwen3-4B-Thinking-2507-merged:gguf-fp16 -ho 127.0.0.1:18181 \
  > /tmp/claude/smart-cat-logs/chat-standard.log 2>&1 &
CHAT_PID=$!
echo -e "${GREEN}✅ Standard Chat Model 已启动 (PID: $CHAT_PID)${NC}"
echo "   日志: /tmp/claude/smart-cat-logs/chat-standard.log"
echo ""

# 启动 Pro Chat Model (18182)
echo "🚀 启动 Pro Chat Model (gpt-oss-20b)..."
echo "   端口: 18182"
nohup nexa serve gpt-oss-20b-base:gguf-fp16 -ho 127.0.0.1:18182 \
  > /tmp/claude/smart-cat-logs/chat-pro.log 2>&1 &
PRO_PID=$!
echo -e "${GREEN}✅ Pro Chat Model 已启动 (PID: $PRO_PID)${NC}"
echo "   日志: /tmp/claude/smart-cat-logs/chat-pro.log"
echo ""

# 🔑 关键修复：启动独立的 Vision Model (18183)
echo "🚀 启动 Vision Model (Qwen3-VL-4B-Instruct)..."
echo "   端口: 18183 ← 🔑 独立端口，解决VL模型无法激活的问题"
nohup nexa serve NexaAI/Qwen3-VL-4B-Instruct-GGUF:gguf-q4-k-m -ho 127.0.0.1:18183 \
  > /tmp/claude/smart-cat-logs/vision.log 2>&1 &
VISION_PID=$!
echo -e "${GREEN}✅ Vision Model 已启动 (PID: $VISION_PID)${NC}"
echo "   日志: /tmp/claude/smart-cat-logs/vision.log"
echo ""

# 等待所有服务就绪
echo "⏳ 等待 AI 服务就绪（预计30-60秒）..."
echo ""

# 检查 Standard Chat (18181)
echo -n "   Standard Chat (18181): "
for i in {1..60}; do
  if curl -s http://127.0.0.1:18181/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Ready${NC}"
    break
  fi
  if [ $i -eq 60 ]; then
    echo -e "${RED}❌ Timeout${NC}"
    echo "请检查日志: tail -f /tmp/claude/smart-cat-logs/chat-standard.log"
  fi
  sleep 1
done

# 检查 Pro Chat (18182)
echo -n "   Pro Chat (18182): "
for i in {1..60}; do
  if curl -s http://127.0.0.1:18182/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Ready${NC}"
    break
  fi
  if [ $i -eq 60 ]; then
    echo -e "${YELLOW}⚠️  Timeout (可选服务)${NC}"
  fi
  sleep 1
done

# 检查 Vision Model (18183) - 关键服务！
echo -n "   Vision Model (18183): "
for i in {1..60}; do
  if curl -s http://127.0.0.1:18183/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Ready (关键服务)${NC}"
    VISION_READY=1
    break
  fi
  if [ $i -eq 60 ]; then
    echo -e "${RED}❌ Timeout - Vision 功能将不可用！${NC}"
    echo "这会导致图像分析失败和幻觉问题。"
    echo "请检查日志: tail -f /tmp/claude/smart-cat-logs/vision.log"
    VISION_READY=0
  fi
  sleep 1
done

echo ""

# 显示状态摘要
echo "==========================================================="
echo -e "${GREEN}🎉 AI 服务启动完成！ / AI Services Ready!${NC}"
echo ""
echo "📊 服务状态 / Service Status:"
echo "   ✅ Standard Chat: http://127.0.0.1:18181 (PID: $CHAT_PID)"
echo "   ✅ Pro Chat:      http://127.0.0.1:18182 (PID: $PRO_PID)"
if [ "$VISION_READY" -eq 1 ]; then
  echo "   ✅ Vision Model:  http://127.0.0.1:18183 (PID: $VISION_PID) ← 关键服务"
else
  echo "   ❌ Vision Model:  http://127.0.0.1:18183 (PID: $VISION_PID) ← 启动失败！"
fi
echo ""
echo "📋 测试命令 / Test Commands:"
echo "  curl http://127.0.0.1:18181/v1/models  # Standard Chat"
echo "  curl http://127.0.0.1:18182/v1/models  # Pro Chat"
echo "  curl http://127.0.0.1:18183/v1/models  # Vision Model"
echo ""
echo "📋 查看日志 / View Logs:"
echo "  tail -f /tmp/claude/smart-cat-logs/chat-standard.log"
echo "  tail -f /tmp/claude/smart-cat-logs/chat-pro.log"
echo "  tail -f /tmp/claude/smart-cat-logs/vision.log"
echo ""
echo "🛑 停止服务 / Stop Services:"
echo "  kill $CHAT_PID $PRO_PID $VISION_PID"
echo "  或使用: pkill -f 'nexa serve'"
echo ""

# 保存 PID
echo "$CHAT_PID" > /tmp/claude/smart-cat-logs/chat-standard.pid
echo "$PRO_PID" > /tmp/claude/smart-cat-logs/chat-pro.pid
echo "$VISION_PID" > /tmp/claude/smart-cat-logs/vision.pid

echo "💡 提示：现在可以运行 ./quick-start.sh 启动前后端服务"
echo ""

# 验证 .env 配置
echo "🔍 验证配置文件 / Verifying Configuration..."
if grep -q "LOCAL_VISION_SERVER_URL=http://127.0.0.1:18183" smart-cat-backend/.env 2>/dev/null; then
  echo -e "${GREEN}✅ .env 配置正确 (Vision 在 18183 端口)${NC}"
else
  echo -e "${RED}❌ .env 配置错误！${NC}"
  echo "请在 smart-cat-backend/.env 中设置:"
  echo "LOCAL_VISION_SERVER_URL=http://127.0.0.1:18183"
fi
echo ""
