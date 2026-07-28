#!/usr/bin/env bash
# Launch the Thalika local VoxCPM2 server (local-server/server.py) as its own process.
# It exposes the SAME Gradio /generate endpoint the Next.js app already speaks, so once
# it's up you just point the app at http://localhost:7860 (or click Start in Voice Settings).
#
# Needs Python 3.10-3.12 (NOT 3.13+) and ideally a GPU (MPS on Apple Silicon, CUDA on
# NVIDIA). First run downloads the ~2B model. Run from the repo root.
set -euo pipefail

# Resolve the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/local-server"
VENV_DIR="$SERVER_DIR/.voxcpm-venv"

cd "$SERVER_DIR"

# Pick a compatible Python: prefer an explicit 3.11/3.12/3.10, fall back to python3.
# voxcpm/torch do not support 3.13+, so we fail loudly (not silently) if that's all there is.
PY_BIN=""
for candidate in python3.11 python3.12 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PY_BIN="$candidate"
    break
  fi
done
if [ -z "$PY_BIN" ]; then
  echo "[thalika-local] ERROR: no python3 found. Install Python 3.10-3.12 first." >&2
  exit 1
fi
PY_VERSION="$("$PY_BIN" -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
echo "[thalika-local] using $PY_BIN ($PY_VERSION)"
case "$PY_VERSION" in
  3.1[0-2]) : ;; # supported
  *)
    echo "[thalika-local] WARNING: Python $PY_VERSION is not supported by voxcpm (needs 3.10-3.12)." >&2
    echo "[thalika-local] Install 3.11 (e.g. 'brew install python@3.11' or 'uv venv --python 3.11') and re-run." >&2
    exit 1
    ;;
esac

# Create the venv once, then install requirements.
if [ ! -d "$VENV_DIR" ]; then
  echo "[thalika-local] creating virtualenv at $VENV_DIR ..."
  "$PY_BIN" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install -U pip >/dev/null
echo "[thalika-local] installing requirements (first run downloads torch + voxcpm; be patient)..."
python -m pip install -r requirements.txt

# --- Download the model BEFORE starting the server, so a stall fails loudly + resumes (instead of
# the server hanging at "loading model 0%" forever). HF Hub stalls a lot from some regions; set
# VOXCPM_USE_MODELSCOPE=1 to pull from the ModelScope mirror instead.
if [ "${VOXCPM_USE_MODELSCOPE:-0}" = "1" ]; then
  echo "[thalika-local] downloading weights from ModelScope (resumable)..."
  python -m pip install -U modelscope >/dev/null
  MODEL_DIR="$SERVER_DIR/pretrained_models/VoxCPM2"
  python -c "from modelscope import snapshot_download; snapshot_download('OpenBMB/VoxCPM2', local_dir='$MODEL_DIR')"
  export VOXCPM_MODEL_DIR="$MODEL_DIR"
else
  # hf_transfer = faster, parallel, resumable; timeout turns a network stall into a retryable error
  # instead of a silent forever-hang.
  export HF_HUB_ENABLE_HF_TRANSFER=1
  export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-30}"
  echo "[thalika-local] downloading weights from Hugging Face (resumable; ~8GB first time)..."
  python -c "from huggingface_hub import snapshot_download; snapshot_download('openbmb/VoxCPM2')"
fi

echo "[thalika-local] starting server on http://0.0.0.0:${VOXCPM_PORT:-7860} ..."
exec python server.py
