#!/usr/bin/env bash
#
# Helper script to kick off the MLX LoRA fine-tuning run for the Pro chat model.
# Expects to be launched from repo root or any directory; it resolves paths
# relative to the project structure documented in AI_training.md.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_BIN="${REPO_DIR}/../venv/bin"
CONFIG_PATH="${REPO_DIR}/scripts/mlx_lora_config.yaml"

if [[ ! -x "${VENV_BIN}/mlx_lm.lora" ]]; then
  echo "mlx_lm.lora not found at ${VENV_BIN}. Activate the MLX venv first." >&2
  exit 1
fi

echo "Launching MLX LoRA training with config:"
echo "  ${CONFIG_PATH}"

cd "${REPO_DIR}"
MLX_ENABLE_METAL=1 "${VENV_BIN}/mlx_lm.lora" -c "${CONFIG_PATH}"
