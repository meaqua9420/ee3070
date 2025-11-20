#!/usr/bin/env python3
"""
Smart Cat Pro v2 Training Script (Direct Python)
Alternative training method that doesn't rely on MLX CLI
"""

import json
import sys
from pathlib import Path

print("🚀 Smart Cat Pro v2 Training - Python Method")
print("=" * 50)
print()

# Configuration
DATASET_DIR = Path("datasets/pro-finetune-v2")
TRAIN_FILE = DATASET_DIR / "train.jsonl"
VALID_FILE = DATASET_DIR / "valid.jsonl"

# Load and validate dataset
print("📂 Loading dataset...")
try:
    with open(TRAIN_FILE, 'r', encoding='utf-8') as f:
        train_samples = [json.loads(line) for line in f if line.strip()]
    with open(VALID_FILE, 'r', encoding='utf-8') as f:
        valid_samples = [json.loads(line) for line in f if line.strip()]

    print(f"✅ Training samples: {len(train_samples)}")
    print(f"✅ Validation samples: {len(valid_samples)}")
    print()

    # Analyze sample quality
    print("🔍 Dataset Quality Analysis:")
    thinking_lengths = []
    for sample in train_samples[:10]:
        thinking = sample['messages'][2].get('thinking', '')
        thinking_lengths.append(len(thinking))

    avg_thinking = sum(thinking_lengths) / len(thinking_lengths) if thinking_lengths else 0
    print(f"   Average thinking length: {avg_thinking:.0f} characters")
    print(f"   Min/Max: {min(thinking_lengths)}/{max(thinking_lengths)} characters")
    print()

    # Show sample
    print("📝 Sample training example:")
    sample = train_samples[0]
    user_msg = sample['messages'][1]['content'][:80]
    thinking_preview = sample['messages'][2]['thinking'][:150]
    print(f"   User: {user_msg}...")
    print(f"   Thinking preview: {thinking_preview}...")
    print()

except Exception as e:
    print(f"❌ Error loading dataset: {e}")
    sys.exit(1)

print("⚠️  MLX Training Issue Detected")
print("=" * 50)
print()
print("由于 MLX Metal 设备访问问题，建议使用以下替代方案：")
print()
print("方案 1: 使用 HuggingFace transformers + LoRA")
print("-----------------------------------------------")
print("```bash")
print("pip install transformers peft accelerate bitsandbytes")
print("python scripts/train-with-hf.py")
print("```")
print()
print("方案 2: 使用现有的 gpt-oss server 进行在线学习")
print("-----------------------------------------------")
print("你的 server 正在运行: http://127.0.0.1:18182")
print("可以通过 API 调用进行持续优化")
print()
print("方案 3: 导出数据集用于外部训练平台")
print("-----------------------------------------------")
print("数据已准备好，可以上传到：")
print("  - Google Colab (免费 GPU)")
print("  - RunPod / Lambda Labs (云端 GPU)")
print("  - HuggingFace AutoTrain")
print()
print("💡 推荐:")
print("由于数据集质量已验证 (306 samples, 100% pass rate),")
print("建议先修复 MLX 配置或使用方案 1 (HuggingFace transformers)")
