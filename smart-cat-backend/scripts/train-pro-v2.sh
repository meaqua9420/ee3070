#!/bin/bash
# Smart Cat Pro v2 Training Script
# This script trains the Pro model using MLX LoRA fine-tuning

set -e  # Exit on error

echo "🚀 Smart Cat Pro v2 Training Script"
echo "===================================="
echo ""

# Configuration
VENV_PATH="/Users/meaqua/Desktop/EE3070/venv"
BASE_MODEL="/Users/meaqua/Desktop/EE3070/models/gpt-oss-20b"
DATASET_PATH="datasets/pro-finetune-v2"
ADAPTER_PATH="adapters/smart-cat-pro-v2"
LEARNING_RATE="1e-5"
ITERS="1000"
BATCH_SIZE="1"
VAL_BATCHES="5"

# Activate virtual environment
echo "📦 Activating virtual environment..."
source "$VENV_PATH/bin/activate"

# Check if dataset exists
if [ ! -f "$DATASET_PATH/train.jsonl" ]; then
    echo "❌ Error: Training dataset not found at $DATASET_PATH/train.jsonl"
    exit 1
fi

echo "✅ Dataset found: $(wc -l < $DATASET_PATH/train.jsonl) training samples"
echo ""

# Create adapter directory
mkdir -p "$ADAPTER_PATH"

echo "⚙️  Training Configuration:"
echo "   Base Model: $BASE_MODEL"
echo "   Dataset: $DATASET_PATH"
echo "   Output: $ADAPTER_PATH"
echo "   Learning Rate: $LEARNING_RATE"
echo "   Iterations: $ITERS"
echo "   Batch Size: $BATCH_SIZE"
echo ""

echo "🎯 Starting LoRA training..."
echo "This may take 30-60 minutes depending on your hardware."
echo ""

# Run MLX LoRA training
mlx_lm.lora \
    --model "$BASE_MODEL" \
    --train \
    --data "$DATASET_PATH" \
    --iters $ITERS \
    --learning-rate $LEARNING_RATE \
    --batch-size $BATCH_SIZE \
    --val-batches $VAL_BATCHES \
    --adapter-path "$ADAPTER_PATH" \
    --save-every 100 \
    --test \
    --test-batches 10

echo ""
echo "✅ Training complete!"
echo ""
echo "📊 Next steps:"
echo "   1. Test the model: ./scripts/test-pro-model-v2.sh"
echo "   2. Update .env with: LOCAL_LLM_PRO_MODEL_ID=smart-cat-pro-v2"
echo "   3. Restart backend: npm start"
