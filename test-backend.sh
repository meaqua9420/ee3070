#!/bin/bash

# 🧪 测试智能猫咪后端新功能
# Test Smart Cat Backend New Features

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
BASE_URL="http://localhost:4000"
ADMIN_KEY="${ADMIN_API_KEY:-}"  # 从环境变量读取，或手动设置

# 检查依赖
command -v curl >/dev/null 2>&1 || { echo "❌ 需要安装 curl"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "⚠️  建议安装 jq 以获得更好的输出格式"; }

echo -e "${BLUE}🧪 测试智能猫咪后端功能${NC}"
echo "=================================================="
echo ""

# 检查服务器是否运行
echo -e "${YELLOW}🔍 检查后端服务器状态...${NC}"
if ! curl -s "${BASE_URL}/api/health" > /dev/null; then
    echo -e "${RED}❌ 后端服务器未运行！${NC}"
    echo "请先启动后端服务器："
    echo "  cd smart-cat-backend && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ 后端服务器运行中${NC}"
echo ""

# 检查 ADMIN_KEY
if [ -z "$ADMIN_KEY" ]; then
    echo -e "${YELLOW}⚠️  未设置 ADMIN_API_KEY 环境变量${NC}"
    echo "请设置环境变量或编辑此脚本："
    echo "  export ADMIN_API_KEY='your-admin-key'"
    echo ""
    echo "跳过需要管理员权限的测试..."
    SKIP_ADMIN=true
else
    echo -e "${GREEN}✅ ADMIN_API_KEY 已设置${NC}"
    SKIP_ADMIN=false
fi
echo ""

# 测试 1: 获取校准历史记录
echo -e "${BLUE}📋 测试 1: 获取校准历史记录${NC}"
echo "--------------------------------------------------"
if command -v jq >/dev/null 2>&1; then
    curl -s "${BASE_URL}/api/calibration/history?limit=10" | jq '.'
else
    curl -s "${BASE_URL}/api/calibration/history?limit=10"
fi
echo ""
echo -e "${GREEN}✅ 测试 1 完成${NC}"
echo ""

# 测试 2: 更新校准配置（需要管理员权限）
if [ "$SKIP_ADMIN" = false ]; then
    echo -e "${BLUE}📋 测试 2: 更新校准配置（会自动保存历史）${NC}"
    echo "--------------------------------------------------"
    if command -v jq >/dev/null 2>&1; then
        curl -s -X POST "${BASE_URL}/api/calibration" \
          -H "Content-Type: application/json" \
          -H "x-admin-key: ${ADMIN_KEY}" \
          -d '{
            "fsrZero": 150,
            "fsrScale": 5500,
            "waterLevelFullCm": 12.5,
            "waterLevelEmptyCm": 2.0,
            "ldrDark": 50,
            "ldrBright": 950,
            "catPresenceThresholdKg": 0.8
          }' | jq '.'
    else
        curl -s -X POST "${BASE_URL}/api/calibration" \
          -H "Content-Type: application/json" \
          -H "x-admin-key: ${ADMIN_KEY}" \
          -d '{
            "fsrZero": 150,
            "fsrScale": 5500,
            "waterLevelFullCm": 12.5,
            "waterLevelEmptyCm": 2.0,
            "ldrDark": 50,
            "ldrBright": 950,
            "catPresenceThresholdKg": 0.8
          }'
    fi
    echo ""
    echo -e "${GREEN}✅ 测试 2 完成${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  跳过测试 2（需要管理员权限）${NC}"
    echo ""
fi

# 测试 3: 再次获取校准历史（应该有新记录）
echo -e "${BLUE}📋 测试 3: 再次获取校准历史（应该有新记录）${NC}"
echo "--------------------------------------------------"
if command -v jq >/dev/null 2>&1; then
    curl -s "${BASE_URL}/api/calibration/history?limit=5" | \
      jq '.data.items[] | {id, changedBy, createdAt, changeSummary}'
else
    curl -s "${BASE_URL}/api/calibration/history?limit=5"
fi
echo ""
echo -e "${GREEN}✅ 测试 3 完成${NC}"
echo ""

# 测试 4: 回滚说明
echo -e "${BLUE}📋 测试 4: 校准回滚功能${NC}"
echo "--------------------------------------------------"
if [ "$SKIP_ADMIN" = false ]; then
    echo "获取历史记录 ID..."
    if command -v jq >/dev/null 2>&1; then
        HISTORY_ID=$(curl -s "${BASE_URL}/api/calibration/history?limit=1" | jq -r '.data.items[0].id')
        if [ "$HISTORY_ID" != "null" ] && [ -n "$HISTORY_ID" ]; then
            echo "最新历史 ID: $HISTORY_ID"
            echo ""
            echo "执行回滚到版本 #${HISTORY_ID}..."
            curl -s -X POST "${BASE_URL}/api/calibration/rollback/${HISTORY_ID}" \
              -H "x-admin-key: ${ADMIN_KEY}" | jq '.'
            echo ""
            echo -e "${GREEN}✅ 测试 4 完成${NC}"
        else
            echo -e "${YELLOW}⚠️  没有历史记录可回滚${NC}"
        fi
    else
        echo "请手动执行以下命令测试回滚功能："
        echo "curl -X POST \"${BASE_URL}/api/calibration/rollback/<history-id>\" \\"
        echo "  -H \"x-admin-key: ${ADMIN_KEY}\" | jq '.'"
    fi
else
    echo "请手动执行以下命令测试回滚功能："
    echo "curl -X POST \"${BASE_URL}/api/calibration/rollback/<history-id>\" \\"
    echo "  -H \"x-admin-key: YOUR_ADMIN_KEY\""
fi
echo ""

# 测试 5: 记忆相关性评分
echo -e "${BLUE}🔍 测试 5: 记忆相关性评分${NC}"
echo "--------------------------------------------------"
echo "记忆筛选会在 AI 聊天时自动生效。"
echo ""
echo "启用调试模式查看筛选日志："
echo -e "${GREEN}  cd smart-cat-backend${NC}"
echo -e "${GREEN}  SMART_CAT_AI_DEBUG=true npm run dev${NC}"
echo ""
echo "然后在前端 AI 聊天面板发送问题，后端会输出："
echo -e "${YELLOW}  [ai-debug] Filtered 43 memories to 8 relevant ones${NC}"
echo ""

# 测试总结
echo ""
echo "=================================================="
echo -e "${GREEN}✅ 测试脚本已完成${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}💡 提示 / Tips:${NC}"
echo "1. 确保后端服务器正在运行: ${YELLOW}cd smart-cat-backend && npm run dev${NC}"
echo "2. 设置环境变量: ${YELLOW}export ADMIN_API_KEY='your-key'${NC}"
echo "3. 查看服务器日志以获取详细信息"
echo "4. 完整文档: ${YELLOW}README.md${NC} 和 ${YELLOW}IMPLEMENTATION_SUMMARY.md${NC}"
echo ""
echo -e "${BLUE}📚 相关文档:${NC}"
echo "- 快速启动指南: ${YELLOW}QUICK_START_ZH.md${NC}"
echo "- 实现总结: ${YELLOW}IMPLEMENTATION_SUMMARY.md${NC}"
echo "- 更新日志: ${YELLOW}CHANGELOG.md${NC}"
echo ""

