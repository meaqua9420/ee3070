#!/bin/bash
# MLX 修复脚本 - 重新安装 MLX 以解决 Metal 访问问题

set -e

echo "🔧 MLX Metal 访问问题修复脚本"
echo "================================"
echo ""

VENV_PATH="/Users/meaqua/Desktop/EE3070/venv"

echo "📦 激活虚拟环境..."
source "$VENV_PATH/bin/activate"

echo "✅ Python version: $(python3 --version)"
echo "✅ Pip version: $(pip --version)"
echo ""

echo "📋 当前 MLX 版本:"
pip show mlx mlx-lm 2>/dev/null | grep -E "(Name|Version)" || echo "未安装或无法检测"
echo ""

echo "🗑️  卸载现有 MLX 包..."
pip uninstall -y mlx mlx-lm mlx-metal 2>/dev/null || true
echo ""

echo "🧹 清理缓存..."
pip cache purge 2>/dev/null || true
rm -rf ~/Library/Caches/pip/http* 2>/dev/null || true
echo ""

echo "📥 重新安装最新版 MLX..."
pip install --no-cache-dir --upgrade mlx mlx-lm
echo ""

echo "✅ 安装完成！新版本:"
pip show mlx mlx-lm | grep -E "(Name|Version)"
echo ""

echo "🧪 测试 MLX Metal 访问..."
python3 << 'PYTHON_TEST'
try:
    import mlx.core as mx
    print("✅ MLX 导入成功")
    print(f"✅ MLX 版本: {mx.__version__ if hasattr(mx, '__version__') else 'unknown'}")

    # 尝试创建一个简单的数组
    arr = mx.array([1, 2, 3])
    print(f"✅ Metal 数组创建成功: {arr}")
    print("✅ MLX Metal 访问正常！")
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
PYTHON_TEST

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 MLX 修复成功！可以开始训练了"
    echo ""
    echo "下一步："
    echo "  ./scripts/train-pro-v2.sh"
else
    echo ""
    echo "❌ MLX 仍有问题，尝试备选方案..."
    echo ""
    echo "备选方案 1: 使用特定版本"
    echo "  pip install mlx==0.20.0 mlx-lm==0.20.0"
    echo ""
    echo "备选方案 2: 检查系统权限"
    echo "  sudo xcode-select --install"
    echo "  sudo xcodebuild -license accept"
fi
