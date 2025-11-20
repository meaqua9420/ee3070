#!/bin/bash
# 🧪 AI 功能修复验证脚本 / AI Fix Verification Script

echo "🧪 AI 功能修复验证 / AI Fix Verification"
echo "==========================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

# 测试函数
test_item() {
  local description=$1
  local test_command=$2
  local expected_result=$3

  echo -n "   $description ... "

  if eval "$test_command"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAILED++))
    if [ -n "$expected_result" ]; then
      echo "      预期: $expected_result"
    fi
  fi
}

echo "📋 第一步：配置文件检查 / Configuration Check"
echo "-----------------------------------------------------------"

# 检查 .env 文件
test_item "Vision 端口配置" \
  "grep -q 'LOCAL_VISION_SERVER_URL=http://127.0.0.1:18183' /Users/meaqua/Desktop/EE3070/smart-cat-backend/.env" \
  "LOCAL_VISION_SERVER_URL=http://127.0.0.1:18183"

test_item "Chat 端口配置" \
  "grep -q 'LOCAL_LLM_SERVER_URL=http://127.0.0.1:18181' /Users/meaqua/Desktop/EE3070/smart-cat-backend/.env" \
  "LOCAL_LLM_SERVER_URL=http://127.0.0.1:18181"

test_item "Pro Chat 端口配置" \
  "grep -q 'LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18182' /Users/meaqua/Desktop/EE3070/smart-cat-backend/.env" \
  "LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18182"

echo ""

echo "📋 第二步：代码修复检查 / Code Fix Check"
echo "-----------------------------------------------------------"

# 检查系统提示词增强
test_item "反幻觉规则已添加" \
  "grep -q 'CRITICAL RULES - Vision Analysis' /Users/meaqua/Desktop/EE3070/smart-cat-backend/src/ai.ts" \
  "系统提示词包含反幻觉规则"

test_item "Vision失败处理已改进" \
  "grep -q 'Vision Analysis Failed' /Users/meaqua/Desktop/EE3070/smart-cat-backend/src/index.ts" \
  "Vision失败时返回明确错误信息"

test_item "Vision调试日志已添加" \
  "grep -q 'VISION DEBUG' /Users/meaqua/Desktop/EE3070/smart-cat-backend/src/ai.ts" \
  "包含详细的Vision调试日志"

# 检查编译产物
test_item "Backend已编译" \
  "[ -f /Users/meaqua/Desktop/EE3070/smart-cat-backend/dist/index.js ]" \
  "dist/index.js 存在"

test_item "AI模块已编译" \
  "[ -f /Users/meaqua/Desktop/EE3070/smart-cat-backend/dist/ai.js ]" \
  "dist/ai.js 存在"

echo ""

echo "📋 第三步：启动脚本检查 / Startup Script Check"
echo "-----------------------------------------------------------"

test_item "AI服务启动脚本存在" \
  "[ -f /Users/meaqua/Desktop/EE3070/start-ai-services.sh ]" \
  "start-ai-services.sh 存在"

test_item "AI服务脚本可执行" \
  "[ -x /Users/meaqua/Desktop/EE3070/start-ai-services.sh ]" \
  "脚本有可执行权限"

test_item "脚本包含Vision服务" \
  "grep -q '18183' /Users/meaqua/Desktop/EE3070/start-ai-services.sh" \
  "脚本启动18183端口的Vision服务"

echo ""

echo "📋 第四步：服务运行检查 / Service Check (可选)"
echo "-----------------------------------------------------------"

# 检查服务是否在运行
test_item "Standard Chat 服务运行中" \
  "curl -s http://127.0.0.1:18181/v1/models > /dev/null 2>&1" \
  "18181端口响应正常 (如未启动请运行 ./start-ai-services.sh)"

test_item "Pro Chat 服务运行中" \
  "curl -s http://127.0.0.1:18182/v1/models > /dev/null 2>&1" \
  "18182端口响应正常 (可选服务)"

test_item "Vision 服务运行中 (关键)" \
  "curl -s http://127.0.0.1:18183/v1/models > /dev/null 2>&1" \
  "18183端口响应正常 (关键! 如未启动请运行 ./start-ai-services.sh)"

echo ""

echo "==========================================================="
echo "📊 测试结果摘要 / Test Summary"
echo "-----------------------------------------------------------"
echo -e "   通过: ${GREEN}$PASSED${NC}"
echo -e "   失败: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 所有检查通过！AI功能修复完成。${NC}"
  echo ""
  echo "📋 下一步操作 / Next Steps:"
  echo ""
  echo "1. 如果AI服务未运行，请执行:"
  echo "   ./start-ai-services.sh"
  echo ""
  echo "2. 启动前后端服务:"
  echo "   ./quick-start.sh"
  echo ""
  echo "3. 测试图像分析功能:"
  echo "   - 上传一张猫咪照片"
  echo "   - 观察是否有 [VISION DEBUG] 日志"
  echo "   - 确认AI基于真实视觉分析回复，而非幻觉"
  echo ""
  echo "4. 检查修复效果:"
  echo "   ✅ VL模型应该在18183端口正常响应"
  echo "   ✅ Chat模型应该基于Vision分析结果回复"
  echo "   ✅ 不应再出现幻觉（虚构猫咪姿势、光线等）"
  echo "   ✅ 不应泄露系统提示词或推理token"
  echo ""
else
  echo -e "${RED}⚠️  有 $FAILED 项检查失败，请修复后再继续。${NC}"
  echo ""
  echo "常见问题排查:"
  echo "1. 配置文件错误 → 检查 smart-cat-backend/.env"
  echo "2. 代码未编译 → 运行 cd smart-cat-backend && npm run build"
  echo "3. 服务未启动 → 运行 ./start-ai-services.sh"
fi

echo ""
echo "📚 修复文档 / Fix Documentation:"
echo "   查看详细修复说明: cat AI_FIX_SUMMARY.md"
echo ""
