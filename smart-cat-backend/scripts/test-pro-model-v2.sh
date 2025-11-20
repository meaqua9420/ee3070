#!/bin/bash
# Test Smart Cat Pro v2 Model

set -e

echo "🧪 Testing Smart Cat Pro v2 Model"
echo "=================================="
echo ""

VENV_PATH="/Users/meaqua/Desktop/EE3070/venv"
BASE_MODEL="/Users/meaqua/Desktop/EE3070/models/gpt-oss-20b"
ADAPTER_PATH="adapters/smart-cat-pro-v2"

# Activate virtual environment
source "$VENV_PATH/bin/activate"

# Check if adapter exists
if [ ! -d "$ADAPTER_PATH" ]; then
    echo "❌ Error: Adapter not found at $ADAPTER_PATH"
    echo "Please run training first: ./scripts/train-pro-v2.sh"
    exit 1
fi

echo "✅ Adapter found: $ADAPTER_PATH"
echo ""

# Test prompt (Chinese - hydration monitoring scenario)
TEST_PROMPT_ZH="米香今天喝水只有 136 ml，還要點眼藥水。我想安排提醒，也希望你監測今晚有沒有補足水分並記錄。可以幫忙設計流程嗎？"

# Test prompt (English - temperature drop scenario)
TEST_PROMPT_EN="Temperature has dropped from 25°C to 22.8°C over the past 3 hours. Misty is hiding under the couch. Should I adjust the heater?"

echo "📝 Test 1: Chinese hydration monitoring"
echo "Prompt: $TEST_PROMPT_ZH"
echo ""
echo "Response:"
mlx_lm.generate \
    --model "$BASE_MODEL" \
    --adapter-path "$ADAPTER_PATH" \
    --prompt "$TEST_PROMPT_ZH" \
    --max-tokens 500 \
    --temp 0.7

echo ""
echo "=================================="
echo ""

echo "📝 Test 2: English temperature adjustment"
echo "Prompt: $TEST_PROMPT_EN"
echo ""
echo "Response:"
mlx_lm.generate \
    --model "$BASE_MODEL" \
    --adapter-path "$ADAPTER_PATH" \
    --prompt "$TEST_PROMPT_EN" \
    --max-tokens 500 \
    --temp 0.7

echo ""
echo "=================================="
echo ""
echo "✅ Testing complete!"
echo ""
echo "💡 Look for:"
echo "   ✓ Detailed <think> sections with data analysis"
echo "   ✓ References to specific sensor values"
echo "   ✓ Step-by-step reasoning process"
echo "   ✓ Risk assessment and follow-up actions"
echo ""
echo "If the model still produces template responses, try:"
echo "   - Increase training iterations: --iters 1000"
echo "   - Lower learning rate: --learning-rate 5e-6"
echo "   - Train for more epochs"
