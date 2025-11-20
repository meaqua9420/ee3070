#!/usr/bin/env bash
# 修复 MLX 环境 - 移除 PyTorch 冲突
# Fix MLX environment - Remove PyTorch conflicts

set -e

echo "🔧 修复 MLX 环境 / Fixing MLX Environment"
echo "=========================================="
echo ""

VENV_DIR="/Users/meaqua/Desktop/EE3070/venv"

# 检查 venv
if [ ! -d "$VENV_DIR" ]; then
  echo "❌ venv 不存在: $VENV_DIR"
  exit 1
fi

# 激活 venv
echo "📦 激活虚拟环境..."
source "$VENV_DIR/bin/activate"

echo "当前 Python: $(which python)"
echo ""

# 卸载 PyTorch（MLX 不需要）
echo "🗑️  卸载 PyTorch（MLX 不需要 torch）..."
pip uninstall torch torchvision torchaudio -y 2>/dev/null || echo "PyTorch 未安装或已卸载"
echo ""

# 卸载旧的 transformers（有 torch 依赖）
echo "🗑️  卸载旧的 transformers..."
pip uninstall transformers -y 2>/dev/null || echo "transformers 未安装或已卸载"
echo ""

# 重新安装 mlx-lm 和依赖
echo "📥 重新安装 mlx-lm 和无 torch 依赖的 transformers..."
pip install --no-cache-dir mlx-lm
pip install --no-cache-dir transformers --no-deps
pip install --no-cache-dir huggingface-hub tokenizers safetensors
echo ""

# 验证安装
echo "✅ 验证安装..."
python -c "import mlx; print('✓ MLX OK')"
python -c "import mlx_lm; print('✓ MLX-LM OK')"
python -c "from transformers import PreTrainedTokenizer; print('✓ Transformers OK (no torch)')"
echo ""

echo "=========================================="
echo "🎉 MLX 环境修复完成！"
echo ""
echo "📋 下一步："
echo "  ./run_pro_server.sh"
echo ""
