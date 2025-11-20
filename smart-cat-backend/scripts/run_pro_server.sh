#!/usr/bin/env bash
#
# Launch the MLX LoRA inference server for the Pro chat model.
# Writes stdout/stderr to /tmp/mlx-pro.log and runs in the background.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_BIN="${REPO_DIR}/../venv/bin"
BASE_MODEL="${LOCAL_LLM_PRO_BASE_MODEL:-/Users/meaqua/Desktop/EE3070/models/gpt-oss-20b}"
ADAPTER_PATH="${LOCAL_LLM_PRO_ADAPTER_PATH:-/Users/meaqua/Desktop/EE3070/models/gpt-oss-20b-smart-cat-mlx-lora-v4}"
USE_ADAPTER="${LOCAL_LLM_PRO_USE_ADAPTER:-false}"  # 改为 false 禁用 adapter
LOG_FILE="${LOCAL_LLM_PRO_LOG_FILE:-/tmp/mlx-pro.log}"
PORT="${LOCAL_LLM_PRO_PORT:-18182}"
HOST="${LOCAL_LLM_PRO_HOST:-127.0.0.1}"
TEMP="${LOCAL_LLM_PRO_TEMP:-${LOCAL_LLM_PRO_TEMPERATURE:-1.0}}"
TOP_P="${LOCAL_LLM_PRO_TOP_P:-1.0}"
TOP_K="${LOCAL_LLM_PRO_TOP_K:-20}"
MIN_P="${LOCAL_LLM_PRO_MIN_P:-0}"
MAX_TOKENS="${LOCAL_LLM_PRO_MAX_TOKENS:-4096}"
export HUGGING_FACE_HUB_CACHE="/Users/meaqua/.cache/huggingface"

if [[ ! -x "${VENV_BIN}/mlx_lm.server" ]]; then
  echo "mlx_lm.server not found at ${VENV_BIN}. Activate the MLX venv first." >&2
  exit 1
fi

if pgrep -f "mlx_lm.server" >/dev/null 2>&1; then
  echo "mlx_lm.server already running. Stop existing process before launching a new one." >&2
  exit 1
fi

echo "Starting MLX server with:"
echo "  model:        ${BASE_MODEL}"

ADAPTER_ARGS=()
should_use_adapter=1
case "${USE_ADAPTER}" in
  false|False|FALSE|0|off|OFF|disable|disabled)
    should_use_adapter=0
    ;;
esac

if [[ -n "${ADAPTER_PATH}" && should_use_adapter -eq 1 && -e "${ADAPTER_PATH}" ]]; then
  echo "  adapter path: ${ADAPTER_PATH}"
  ADAPTER_ARGS=(--adapter-path "${ADAPTER_PATH}")
else
  echo "  adapter path: (disabled)"
  if [[ -n "${ADAPTER_PATH}" && should_use_adapter -eq 1 && ! -e "${ADAPTER_PATH}" ]]; then
    echo "  warning: adapter path not found, running base model only." >&2
  fi
fi

echo "  host:port:    ${HOST}:${PORT}"
echo "  log file:     ${LOG_FILE}"
echo "  temp/top_p:   ${TEMP}/${TOP_P}"
echo "  max tokens:   ${MAX_TOKENS}"

cd "${REPO_DIR}"
CMD=(
  "${VENV_BIN}/mlx_lm.server"
  --model "${BASE_MODEL}"
  --host "${HOST}"
  --port "${PORT}"
  --temp "${TEMP}"
  --top-p "${TOP_P}"
  --top-k "${TOP_K}"
  --min-p "${MIN_P}"
  --max-tokens "${MAX_TOKENS}"
)
if [[ ${#ADAPTER_ARGS[@]} -gt 0 ]]; then
  CMD+=("${ADAPTER_ARGS[@]}")
fi
nohup "${CMD[@]}" >"${LOG_FILE}" 2>&1 &

echo "Server launched. Tail logs with: tail -f ${LOG_FILE}"
