---
name: thalika-voice-clone
description: Use this skill when working on the Thalika Voice Clone Studio project, a local-first Next.js Burmese voice-over and voice-clone studio using VoxCPM2 remote inference, Gemini script rewrite, local Markdown storage, WAV-only output, voice profiles, Burmese normalization, and listening QA.
---

# Thalika Voice Clone Studio

Use this skill when a coding agent needs to understand, modify, review, or extend the Thalika project without re-learning the whole product from scratch.

Thalika is a local-first voice-over studio for Burmese production voice cloning. It is not a cloud SaaS app, not a database app, and not a local model-hosting stack. The app keeps scripts, jobs, profiles, reviews, logs, and generated audio on the user's machine. By default it calls remote inference (VoxCPM2 Hugging Face Space) for generation and rewrite; a managed local VoxCPM2 server is supported as an optional faster path that the app launches as a separate process and talks to over HTTP.

## Product Intent

Thalika helps the user:

- Rewrite an existing script into more natural spoken narration.
- Send the rewritten script into the voice-over workflow.
- Upload or select a reference voice profile.
- Generate Burmese production voice-over audio through VoxCPM2 remote inference.
- Save all scripts, jobs, reviews, profiles, and outputs locally.
- Preview, download, delete, and review generated audio.
- Keep final audio as real PCM WAV for editing and archiving.

Do not add script generation as a separate creative writing product. The user already brings scripts; Thalika can polish pacing, pauses, emphasis, and narration readiness.

## Current Stack

- Framework: Next.js App Router with React and TypeScript.
- Styling: TailwindCSS with a clean Apple-like light UI.
- Backend: Next.js Route Handlers only.
- Desktop: optional Electron shell around the local Next.js app.
- Validation: Zod.
- Icons: lucide-react.
- Audio decode: `@audio/decode-mp3` for immediate MP3-to-PCM conversion.
- Storage: local files under `data/`; no database.
- Voice inference: VoxCPM2 Hugging Face Space via native `fetch()` by default; an optional managed local VoxCPM2 server (Python, separate process) can be started in-app for faster local inference.
- Script rewrite: Google Gemini API via configured API key.

Never add Docker, Runpod, Supabase, PostgreSQL, MongoDB, Firebase, authentication, or payments. The optional local VoxCPM2 server (Python + the `voxcpm` package, launched as a separate process) is the supported local-inference path; do not embed Python into the Next.js runtime.

## UX Structure

The app uses three main tabs/pages:

- `Script`: paste the original script, optionally rewrite it with Gemini, then carry the rewritten script into Voice Over.
- `Voice Over`: paste or receive the script, choose the provider, upload/select reference audio, approve Burmese normalization, generate local audio.
- `History`: review generated jobs, play audio with an advanced player, download/open files, delete jobs, and save listening QA.

There is also a `Folders` page for local storage visibility, local folder actions, and PCM WAV migration.

Keep the UI minimal, clear, and friendly. Prefer shared components over duplicating page-specific variants. The user wants a polished Apple/Mac/iOS-like feel, readable enough for non-technical users.

## Voice Providers

Current provider concepts:

- `Burmese Production`: recommended preset for Burmese voice cloning. It wraps VoxCPM2 with Burmese-specific validation, transcript use, normalization, quality metadata, and production defaults.
- `VoxCPM2 Multilingual`: direct VoxCPM2 route for supported multilingual text.

Mock, GPT-SoVITS, and CosyVoice were removed from the user-facing workflow. Do not reintroduce them unless requested.

The core remote model is VoxCPM2 from OpenBMB, usually through the public Hugging Face Space configured by `HF_VOXCPM2_URL`.

## Voice Clone Quality Rules

Be honest: Thalika cannot guarantee a perfect 100% human match. The app improves reproducibility and practical quality through better inputs, normalization, chunking, profiles, and QA.

For Burmese Production, protect these layers:

- Reference audio upload or saved local voice profile.
- Exact reference transcript for high-fidelity cloning when available.
- Browser-side reference quality analysis.
- Burmese pronunciation normalization and local lexicon overrides.
- User approval before sending normalized text to generation.
- Chunked generation for long scripts.
- Listening QA after generation.

Do not weaken these checks just to make a button easier to click. If a check blocks too aggressively, tune it carefully and explain the tradeoff in UI or code comments.

## Audio Pipeline

Final audio must be WAV only:

- `48kHz`
- mono
- `24-bit PCM WAV`
- real `RIFF/WAVE`

The public HF Space may return compressed MP3 bytes. Thalika must immediately decode remote audio in memory, write temporary chunks as validated PCM WAV, discard MP3 bytes, and merge WAV chunks into one final master.

Do not concatenate MP3 files. Do not save newly generated MP3 chunks to `data/outputs/`. Do not produce mislabeled `.wav` files containing MPEG audio.

Long scripts are chunked with punctuation-aware pauses:

- `။`, `.`, `!`, `?`: `260ms`
- `၊`, `,`, `;`, `:`: `160ms`
- no explicit punctuation: `120ms`

Relevant modules:

- `src/lib/script-chunker.ts`
- `src/lib/audio-utils.ts`
- `src/lib/providers/voxcpm2-provider.ts`
- `src/lib/storage/output-wav-migration.ts`

## Local Storage

All persistent app data lives locally:

- `data/scripts/`: script Markdown files.
- `data/jobs/`: generation job Markdown files.
- `data/outputs/`: generated WAV files.
- `data/outputs/legacy-backup/`: migrated compressed legacy originals.
- `data/memory/`: memory notes and Burmese lexicon JSON.
- `data/profiles/`: consented local voice profiles and reference files.
- `data/reviews/`: listening QA Markdown files.
- `data/logs/`: diagnostics logs.

Do not expose arbitrary filesystem access from API routes. Only read and write known app-managed folders. Sanitize filenames and prevent path traversal.

## Important API Routes

- `GET /api/health`: basic app health.
- `POST /api/rewrite`: Gemini narration rewrite.
- `POST /api/generate`: validate, save script/job, call provider, save output, return local audio URL.
- `GET /api/audio/[filename]`: serve audio from `data/outputs/` only.
- `GET /api/history`: list recent job Markdown.
- `DELETE /api/history/[jobId]`: delete job and generated output.
- `POST /api/burmese/normalize`: normalize Burmese text and return changes.
- `GET | PUT /api/settings/burmese-lexicon`: manage local pronunciation overrides.
- `GET | POST /api/voice-profiles`: list/create consented local profiles.
- `DELETE /api/voice-profiles/[profileId]`: delete saved profile and reference file.
- `PUT /api/history/[jobId]/review`: save listening QA.
- `GET | POST /api/storage/migrate-wav`: inspect and migrate legacy audio to real PCM WAV.
- `GET /api/providers/voxcpm2/health`: check remote VoxCPM2 availability.

Any route that touches the filesystem must use `export const runtime = "nodejs";`.

## Environment

Important environment values:

- `HF_VOXCPM2_URL`
- `HF_REQUEST_TIMEOUT`
- `HF_INFERENCE_TIMEOUT`
- `GEMINI_REQUEST_TIMEOUT`
- `GEMINI_API_KEY`

Gemini API key can be saved through the app settings dialog into `.env.local`. Do not hardcode API keys.

## Development Commands

Use:

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
```

Electron:

```bash
npm run desktop
npm run desktop:start
npm run repair:electron
```

Resource diagnostics:

```bash
npm run metrics:memory
npm run metrics:resources
```

## Editing Guidelines For Agents

Before changing behavior:

1. Read nearby code and use existing patterns.
2. Preserve local-first storage.
3. Preserve WAV-only output.
4. Preserve long-script chunking and merge behavior.
5. Preserve Burmese Production as the recommended preset.
6. Preserve privacy boundaries: never store raw audio in job Markdown or expose audio bytes in profile lists.
7. Keep generated scripts/jobs/reviews as Markdown unless the existing store uses JSON.
8. Keep UI changes consistent with shared components and the current light theme.

When fixing generation failures, check these areas first:

- Request validation in `src/lib/validators.ts`.
- Chunking in `src/lib/script-chunker.ts`.
- Remote call handling in `src/lib/providers/hf-utils.ts` and `src/lib/providers/voxcpm2-provider.ts`.
- WAV decode and merge in `src/lib/audio-utils.ts`.
- Job progress and diagnostics in `src/lib/services/generation-service.ts` and `src/lib/storage/generation-log.ts`.

When fixing UI disable states, check:

- `src/components/VoiceSettings.tsx`
- `src/components/GenerateButton.tsx`
- `src/components/NormalizationApprovalPanel.tsx`
- `src/app/page.tsx`
- `src/app/script/page.tsx`

## Validation Checklist

For backend or provider changes, run:

```bash
npm run lint
npm run build
```

For audio pipeline changes, additionally verify:

- Short script generation.
- Multi-chunk long script generation.
- Final output starts with `RIFF` and contains `WAVE`.
- `file data/outputs/*.wav` reports PCM WAV, not MPEG audio.
- `/api/audio/{filename}` returns `audio/wav`.
- History playback and download still work.

For UI changes, verify:

- Script tab can rewrite and send text to Voice Over.
- Voice Over tab can generate with Burmese Production.
- History tab plays audio and saves QA.
- Folders page still reports storage and migration status.
- Mobile and desktop layouts do not overlap.

## Better Agent Handoff Pattern

Keep this `SKILL.md` as the compact project brain for coding agents.

For broad compatibility with Claude Code, Cursor, Codex, and other coding agents, a future improvement can add:

- `AGENTS.md`: repo-level instructions many agents automatically read.
- `docs/ARCHITECTURE.md`: longer technical architecture reference.
- `docs/VOICE_PIPELINE.md`: detailed audio and VoxCPM2 flow.
- `docs/UI_GUIDE.md`: design system and interaction rules.

Do not duplicate too much content across these files. Keep `SKILL.md` short enough to load quickly, then link to deeper docs only when needed.
