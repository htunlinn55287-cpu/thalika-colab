"""Colab/local VoxCPM2 inference server for Thalika.

The Gradio contract intentionally mirrors src/lib/providers/voxcpm2-provider.ts.
VoxCPM2 style control is applied by prefixing the target text with a natural-language
instruction in parentheses, as documented by the upstream VoxCPM2 controllable-cloning API.
"""

from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path
from typing import Any

import gradio as gr
import numpy as np
import soundfile as sf
from voxcpm import VoxCPM

MODEL = os.environ.get("VOXCPM_MODEL_DIR", "openbmb/VoxCPM2")
LOAD_DENOISER = os.environ.get("VOXCPM_LOAD_DENOISER", "0").lower() not in ("0", "false", "no")
DEFAULT_TIMESTEPS = int(os.environ.get("VOXCPM_TIMESTEPS", "24"))
DEFAULT_SEED = int(os.environ.get("VOXCPM_SEED", "42"))

print(f"[thalika-local] loading {MODEL} (denoiser={LOAD_DENOISER})")
model = VoxCPM.from_pretrained(MODEL, load_denoiser=LOAD_DENOISER)
model_lock = threading.Lock()


def _reference_path(audio: Any) -> str | None:
    if audio is None:
        return None
    if isinstance(audio, str):
        return audio
    if isinstance(audio, dict) and audio.get("path"):
        return str(audio["path"])
    if isinstance(audio, tuple) and len(audio) == 2:
        sample_rate, samples = audio
        handle = tempfile.NamedTemporaryFile(prefix="thalika-reference-", suffix=".wav", delete=False)
        handle.close()
        sf.write(handle.name, np.asarray(samples), int(sample_rate))
        return handle.name
    return None


def _controlled_text(text: str, control: str) -> str:
    clean_text = (text or "").strip()
    clean_control = " ".join((control or "").strip().split())
    if not clean_control:
        return clean_text
    return f"({clean_control}){clean_text}"


def generate(
    text,
    control,
    audio,
    use_prompt_text,
    prompt_text,
    cfg_value,
    normalize,
    denoise,
    inference_timesteps,
    retry_badcase,
    seed,
):
    """Generate one stable chunk; Thalika handles chunking and final WAV mastering."""
    ref_path = _reference_path(audio)
    cfg = min(4.0, max(1.0, float(cfg_value or 2.0)))
    timesteps = min(50, max(4, int(inference_timesteps or DEFAULT_TIMESTEPS)))
    seed_value = int(seed if seed is not None else DEFAULT_SEED) & 0x7FFFFFFF
    target_text = _controlled_text(str(text or ""), str(control or ""))
    if not target_text:
        raise gr.Error("Text is required.")

    kwargs: dict[str, Any] = {
        "text": target_text,
        "cfg_value": cfg,
        "inference_timesteps": timesteps,
        "retry_badcase": bool(retry_badcase),
        "seed": seed_value,
        "normalize": bool(normalize),
        "denoise": bool(denoise) and LOAD_DENOISER,
    }
    if ref_path:
        kwargs["reference_wav_path"] = ref_path
        if use_prompt_text and prompt_text and str(prompt_text).strip():
            kwargs["prompt_wav_path"] = ref_path
            kwargs["prompt_text"] = str(prompt_text).strip()

    with model_lock:
        wav = model.generate(**kwargs)

    output = tempfile.NamedTemporaryFile(prefix="thalika-chunk-", suffix=".wav", delete=False)
    output.close()
    sf.write(
        output.name,
        np.asarray(wav, dtype=np.float32),
        model.tts_model.sample_rate,
        subtype="PCM_16",
    )
    return output.name


demo = gr.Interface(
    fn=generate,
    inputs=[
        gr.Textbox(label="text"),
        gr.Textbox(label="control"),
        gr.Audio(label="audio", type="filepath"),
        gr.Checkbox(label="use_prompt_text", value=False),
        gr.Textbox(label="prompt_text", value=""),
        gr.Slider(1.0, 4.0, value=2.0, step=0.1, label="cfg_value"),
        gr.Checkbox(label="normalize", value=True),
        gr.Checkbox(label="denoise", value=False),
        gr.Slider(4, 50, value=DEFAULT_TIMESTEPS, step=1, label="inference_timesteps"),
        gr.Checkbox(label="retry_badcase", value=True),
        gr.Number(value=DEFAULT_SEED, precision=0, label="seed"),
    ],
    outputs=gr.Audio(label="output", type="filepath"),
    api_name="generate",
    flagging_mode="never",
)

demo.queue(default_concurrency_limit=1, max_size=20)

if __name__ == "__main__":
    port = int(os.environ.get("VOXCPM_PORT", "7860"))
    demo.launch(server_name="0.0.0.0", server_port=port, show_error=True)
