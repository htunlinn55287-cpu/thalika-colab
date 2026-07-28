# Thalika Local VoxCPM2 Server

This is the optional local inference backend for Thalika. It runs VoxCPM2 on your
own machine as a **separate process** and exposes the same Gradio `/generate`
endpoint the Next.js app already speaks — so once it's up, you just point the app
at `http://localhost:7860` (or click **Start** in the app's Voice Settings).

Local inference is faster and free of the public Hugging Face Space's rate limits,
and lets you tune quality via `VOXCPM_TIMESTEPS`.

## Requirements

- **Python 3.10, 3.11, or 3.12** — Python 3.13+ is **not** supported (the `voxcpm` /
  PyTorch stack does not build on it yet). Check: `python3 --version`.
- Ideally a GPU: **Apple Silicon (MPS)** works and is much faster than CPU; **CUDA**
  on NVIDIA is fastest. CPU works but is slow.
- ~5 GB free disk for the model (downloaded once, then cached).
- ~8 GB RAM.

## Quick start

The easiest way is the launcher script from the repo root:

```bash
bash scripts/voxcpm-local.sh
```

It creates a virtualenv (`.voxcpm-venv/`), installs `requirements.txt`, and runs
`server.py`. The first run downloads the ~2B model, so be patient (several minutes).

When you see `Running on local URL: http://0.0.0.0:7860`, the server is ready.

## Manual install (if you prefer control over the Python version)

### Option A — uv (recommended; fetches an isolated Python 3.11)

```bash
# install uv once:  brew install uv   (macOS)  or see https://docs.astral.sh/uv/
cd local-server
uv venv --python 3.11
source .voxcpm-venv/bin/activate
uv pip install -r requirements.txt
python server.py
```

### Option B — pyenv / system Python 3.10–3.12

```bash
cd local-server
python3.11 -m venv .voxcpm-venv          # use 3.10 / 3.11 / 3.12
source .voxcpm-venv/bin/activate
pip install -U pip
pip install -r requirements.txt
python server.py
```

## Connecting Thalika to the local server

With the server running on `:7860`, either:

1. In the app → **Voice Over → Voice Settings → VoxCPM endpoint**, click **Start**
   (the app launches `scripts/voxcpm-local.sh` for you), then click **Local** and
   **Save & check**. The health badge should turn green (`connected`).

2. Or set it manually in `.env.local`:
   ```bash
   HF_VOXCPM2_URL=http://localhost:7860
   ```
   and restart the app.

## Configuration (environment variables)

| Variable | Default | Effect |
| --- | --- | --- |
| `VOXCPM_DEVICE` | `auto` | `auto` / `cuda` / `mps` / `cpu` |
| `VOXCPM_TIMESTEPS` | `10` | Diffusion sampling steps. Higher = better quality, slower. Try `20`–`30`. |
| `VOXCPM_PORT` | `7860` | Port the Gradio server listens on (must match the app's endpoint). |

Example for higher quality on Apple Silicon:

```bash
VOXCPM_DEVICE=auto VOXCPM_TIMESTEPS=24 python server.py
```

## How it integrates with the app

The app does **not** embed Python. It launches this server as a background process
(via `/api/voxcpm-local`) and calls it over HTTP exactly like it calls the public
HF Space. The `generate()` signature here mirrors the 8 arguments the app sends, in
order, so no app code changes are required.

Key files:
- `local-server/server.py` — this server
- `scripts/voxcpm-local.sh` — one-command launcher
- `src/app/api/voxcpm-local/route.ts` — app-side start/stop/status
- `src/lib/providers/voxcpm2-provider.ts` — the client that calls `/generate`

## Troubleshooting

- **`ModuleNotFoundError: voxcpm`** — you're on the wrong Python. This needs 3.10–3.12.
  Use `uv` (Option A) to get an isolated 3.11.
- **First run is slow** — it's downloading the model. Subsequent runs use the cache.
- **`MPS` errors on older macOS** — set `VOXCPM_DEVICE=cpu` as a fallback.
- **App health badge stays red** — confirm the server is up:
  `curl -s http://localhost:7860/gradio_api/info | head`, and that `HF_VOXCPM2_URL`
  (or the in-app endpoint) is `http://localhost:7860`.
