# Thalika

Thalika သည် Next.js, TypeScript, TailwindCSS နှင့် optional Electron desktop shell ကို အသုံးပြုထားသော local-first voice-over studio ဖြစ်သည်။

Script များ၊ generation job များ၊ generated audio များနှင့် draft state ကို local `data/` folder အောက်တွင် သိမ်းဆည်းသည်။ Database မသုံးပါ။

## လက်ရှိ ပါဝင်သော Features

- Gemini API ဖြင့် script rewrite လုပ်နိုင်သော Script page
- Script input နှင့် reference audio upload ပါသော Voice Over page
- VoxCPM2 engine ကို အသုံးပြုသော single provider (Burmese script အတွက် pronunciation QA အလိုလို အသုံးပြုသည်)
- Default အားဖြင့် VoxCPM2 Hugging Face Space remote inference နှင့် optional managed local VoxCPM2 server
- Validated `48kHz` mono `24-bit PCM WAV` master output
- Long script များအတွက် punctuation-aware chunk ခွဲခြင်းနှင့် PCM WAV merge လုပ်ခြင်း
- Audio preview နှင့် download
- Audio player, listening QA score နှင့် delete action ပါသော History page
- Local consented voice profiles နှင့် editable Burmese pronunciation lexicon
- Browser-side reference audio quality gate
- Local storage ကို ကြည့်ရှုနိုင်ပြီး legacy compressed audio များကို PCM WAV ပြောင်းနိုင်သော Folders page
- Optional Electron desktop shell

## Project Stack

- Frontend: Next.js App Router, React, TailwindCSS
- Backend: Next.js Route Handlers
- Desktop shell: Electron
- Validation: Zod
- Storage: local Markdown, JSON, audio files
- Remote voice provider: VoxCPM2 Hugging Face Space
- Local voice server (optional): `local-server/` (Python + VoxCPM2)
- Script rewrite provider: Google Gemini API

## ကြိုတင် လိုအပ်ချက်များ

- Node.js `22.12.0` သို့မဟုတ် ပိုသစ်သော version
- npm
- VoxCPM2 သို့မဟုတ် Gemini ကို အသုံးပြုမည်ဆိုပါက Internet connection

VoxCPM2 inference ကို default အားဖြင့် local server (`http://localhost:7860`) မှတစ်ဆင့် run သည်။ Local server က inference_timesteps နှင့် retry_badcase အပြည့်အဝ ထိန်းချုပ်နိုင်ပြီး public Space ထက် ပိုမြန်/ပိုတည်ငြိမ်သည်။ Remote (Hugging Face Space) ကို အသုံးပြုလိုပါက `HF_VOXCPM2_URL` ကို public Space သို့ ထားပါ။ Local server အသွင်းအကျေးအတွက် အောက်ပါ "Local VoxCPM2 Server" အပိုင်းကို ကြည့်ပါ။

## Install လုပ်ခြင်း

```bash
cd /Users/zoe/Downloads/beebot/coda-voice-clone/Thalika
npm install
```

## Environment Variables

Default တန်ဖိုးများကို ပြောင်းလိုပါက သို့မဟုတ် Gemini rewrite ကို အသုံးပြုလိုပါက `.env.example` ကို `.env.local` အဖြစ် copy လုပ်ပါ။

```bash
cp .env.example .env.local
```

အသုံးပြုနိုင်သော တန်ဖိုးများ:

```bash
HF_VOXCPM2_URL=https://openbmb-voxcpm-demo.hf.space
HF_REQUEST_TIMEOUT=60000
HF_INFERENCE_TIMEOUT=300000
GEMINI_REQUEST_TIMEOUT=60000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

- `HF_VOXCPM2_URL`: VoxCPM2 Hugging Face Space ၏ base URL
- `HF_REQUEST_TIMEOUT`: Hugging Face request timeout milliseconds
- `HF_INFERENCE_TIMEOUT`: VoxCPM2 audio segment တစ်ခု generate လုပ်ရန် စောင့်မည့် အများဆုံး milliseconds
- `GEMINI_REQUEST_TIMEOUT`: Gemini request timeout milliseconds
- `GEMINI_API_KEY`: Script page မှ rewrite လုပ်ရာတွင် အသုံးပြုသော Gemini API key

Script page ရှိ settings dialog မှတစ်ဆင့် `GEMINI_API_KEY` ကို `.env.local` ထဲသို့ သိမ်းဆည်းနိုင်သည်။

## Browser တွင် Run ခြင်း

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm run build
npm run start
```

Browser တွင် ဖွင့်ရန်:

```text
http://localhost:3000
```

## Electron Desktop App အဖြစ် Run ခြင်း

Development desktop mode:

```bash
npm run desktop
```

Production desktop mode:

```bash
npm run build
npm run desktop:start
```

Electron shell သည် local Next.js app ကို ဖွင့်ပေးသည်။ Backend အသစ်တစ်ခု ထပ်မံထည့်သွင်းထားခြင်း မရှိပါ။

Electron shell တွင် အောက်ပါ settings များကို အသုံးပြုထားသည်။

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- single-instance lock

နောက်ဆုံး Electron window ကို ပိတ်လိုက်ပါက Electron process ပိတ်သွားမည်။ `desktop:start` က local Next.js server ကို စတင်ပေးထားခြင်း ဖြစ်ပါက Electron ပိတ်သည့်အခါ launcher က ထို server ကိုပါ ရပ်ပေးမည်။

Electron binary cache မပြည့်စုံပါက:

```bash
npm run repair:electron
```

## App Pages

### Script

ရှိပြီးသား script ကို Gemini ဖြင့် rewrite လုပ်ရန် ဤ page ကို အသုံးပြုပါ။

1. Script tab ကို ဖွင့်ပါ။
2. Original script ကို paste လုပ်ပါ။
3. လိုအပ်ပါက title ထည့်ပါ။
4. Gemini model ကို ရွေးပါ။
5. `Keep Burmese language` ကို လိုအပ်သလို on သို့မဟုတ် off လုပ်ပါ။
6. `Rewrite Narration` ကို နှိပ်ပါ။
7. Rewritten result ကို စစ်ဆေးပြီး လိုအပ်ပါက ပြင်ဆင်ပါ။
8. `Open Voice Over` ကို နှိပ်ပါ။

Rewritten result ကို shared Voice Over draft အဖြစ် သိမ်းဆည်းသည်။

App တွင် လက်ရှိ ပြသထားသော model options များ:

- Gemini 2.5 Flash
- Gemini 3.5 Flash
- Gemini 3.1 Flash Lite

ရွေးချယ်ထားသော model ကို configured Gemini API endpoint က လက်ခံနိုင်ရမည်။

### Voice Over

Voice Over audio generate လုပ်ရန် ဤ page ကို အသုံးပြုပါ။

1. Voice Over tab ကို ဖွင့်ပါ။
2. Script ကို paste လုပ်ပါ သို့မဟုတ် ပြင်ဆင်ပါ။
3. လိုအပ်ပါက title ထည့်ပါ။
4. Reference audio upload လုပ်ပါ သို့မဟုတ် သိမ်းထားသော local voice profile ကို ရွေးပါ။
5. Browser-side reference quality report ကို စစ်ပါ။ `BLOCK` ဖြစ်နေပါက cleaner sample ပြန်တင်ပါ။
6. Burmese script ဖြစ်ပါက pronunciation preview ကို review လုပ်ပြီး approve လုပ်ပါ။
7. `Generate Local Audio` ကို နှိပ်ပါ။
8. Generated audio file ကို preview လုပ်ပါ သို့မဟုတ် download လုပ်ပါ။

Provider တစ်ခုတည်း (single engine):

- `VoxCPM2` — Burmese script ဖြစ်ပါက Burmese pronunciation QA (normalization + lexicon + approval gate) အလိုလို အသုံးပြုသည်။ Burmese မဟုတ်သော supported multilingual scripts အတွက် raw VoxCPM2 ကို အသုံးပြုသည်။

Voice Over controls များ:

- Reference audio upload
- Local voice profile selector နှင့် explicit-consent profile save
- Reference transcript (optional — cloning အတွက် လိုအပ်ခြင်းမရှိ၊ model သို့လည်း မပို့ပါ)
- Browser-side reference quality report
- Burmese pronunciation lexicon
- Advanced tuning: clone mode, clone strength, reference denoise, text normalization
- Speed: `0.8x` မှ `1.2x`
- Emotion: `neutral`, `calm`, `energetic`, `dramatic`

VoxCPM2 Space (public သို့ local) တွင် dedicated numeric speed parameter မရှိပါ။ Speed slider ကို pace guidance အဖြစ် control instruction ထဲတွင် အသုံးပြုသည်။

Recommended reference audio သည် `6-30` seconds၊ quiet room၊ one speaker၊ music မပါသော dry voice ဖြစ်သည်။ Local voice profile ကို user က consent checkbox ဖြင့် အတည်ပြုပြီး `Save Local Profile` နှိပ်မှသာ device disk ပေါ်တွင် သိမ်းသည်။

လူပြောသံတွင် natural pauses ပါနိုင်သည်။ Silence ratio မြင့်ရုံဖြင့် block မလုပ်ပါ။ Reference file သည် almost entirely silent ဖြစ်မှသာ generation ကိုတားသည်။ VoxCPM2 transcript mode က segment တစ်ခုအတွက် audio မပြန်ပေးနိုင်ပါက Thalika သည် zero-shot reference fallback ဖြင့် ဆက်လုပ်ပြီး local diagnostics တွင် မှတ်တမ်းတင်သည်။

### History

ဤ page တွင် အောက်ပါ လုပ်ဆောင်ချက်များကို အသုံးပြုနိုင်သည်။

- သိမ်းဆည်းထားသော generation job များကို ကြည့်ရှုခြင်း
- Generated audio ကို play လုပ်ခြင်း
- Audio seek လုပ်ခြင်း
- Playback speed ပြောင်းခြင်း
- Audio download လုပ်ခြင်း
- Audio ဖွင့်ခြင်း
- History job ဖျက်ခြင်း
- Speaker similarity, Burmese pronunciation, naturalness နှင့် clean audio ကို `1-5` score ပေးခြင်း
- Generated audio ကို `approved` သို့မဟုတ် `review needed` အဖြစ်မှတ်သားခြင်း

Completed job တစ်ခုကို ဖျက်လိုက်ပါက သက်ဆိုင်ရာ generated audio file ကိုပါ ဖျက်သည်။ သက်ဆိုင်ရာ saved script Markdown file ကို မဖျက်ပါ။

### Folders

App က စီမံထားသော local storage folders များကို ကြည့်ရှုရန် ဤ page ကို အသုံးပြုပါ။

ဤ page တွင် အောက်ပါ အချက်အလက်များကို ပြသသည်။

- Folder path
- File count
- Total size
- Latest modification time
- Recent files

Browser mode တွင် folder path ကို copy လုပ်နိုင်သည်။ Electron mode တွင် သတ်မှတ်ထားသော app-managed folders များကို Finder သို့မဟုတ် Explorer ထဲတွင် ဖွင့်နိုင်သည်။

`PCM WAV Migration` section ကို အသုံးပြုပြီး ယခင် version များမှ `.mp3` outputs နှင့် MP3 bytes ပါနေသော mislabeled `.wav` files များကို real PCM WAV masters အဖြစ် ပြောင်းနိုင်သည်။ Migration မစမီ user confirmation တောင်းသည်။ မူရင်း compressed files များကို `data/outputs/legacy-backup/` အောက်တွင် သိမ်းထားပြီး သက်ဆိုင်ရာ job Markdown metadata ကို migrated `.wav` filename ဖြင့် update လုပ်သည်။

### Local VoxCPM2 Server (optional)

Default အားဖြင့် VoxCPM2 inference ကို local server (`http://localhost:7860`) မှတစ်ဆင့် run သည်။ Local server က inference_timesteps/retry_badcase အပြည့်အဝ ထိန်းချုပ်နိုင်ပြီး public Space ထက် ပိုမြန်/ပိုတည်ငြိမ်သည်။ အသေးစိတ်အတွက် `local-server/README.md` ကို ကြည့်ပါ။

**လိုအပ်ချက်များ**

- Python `3.10`, `3.11`, သို့မဟုတ် `3.12` (3.13+ ကို `voxcpm`/PyTorch stack က လက်မခံပါ)။ `python3 --version` ဖြင့် စစ်ပါ။
- GPU ရှိလျှင် ပိုကောင်းသည် (Apple Silicon MPS, NVIDIA CUDA)။ CPU နှင့်လည်း run နိုင်သော်လည်း နှေးသည်။
- Model (~5 GB) ကို ပထမဆုံး run တွင် download လုပ်သည်။ ~8 GB RAM။

**Install နှင့် run လုပ်ခြင်း**

repo root မှ:

```bash
bash scripts/voxcpm-local.sh
```

၎င်းသည် `.voxcpm-venv` တည်ဆောက်ပြီး `requirements.txt` install လုပ်ကာ `local-server/server.py` ကို run သည်။ Server တက်လာသည်နှင့် `http://localhost:7860` တွင် ရောက်သည်။ Python version မှားနေပါက `brew install python@3.11` (သို့) `uv` ကို အသုံးပြုပါ — အသေးစိတ်အတွက် `local-server/README.md`။

> Note: ဤစက်တွင် Python 3.14 သာ ရှိသောကြောင့် local server ကို ဤတွင် တိုက်ရိုက် run စစ်ဆေး၍ မရပါ။ အထက်ပါ တောင်းဆိုထားသော Python 3.10–3.12 ပါသော စက်တွင် run ပါ။

**App ကို local server သို့ ချိတ်ခြင်း**

1. App → Voice Over → Voice Settings → VoxCPM endpoint တွင် `Start` ကို နှိပ်ပါ (app က `scripts/voxcpm-local.sh` ကို background တွင် run ပေးသည်)။
2. `Local` ကို နှိပ်ပြီး `Save & check` ကို နှိပ်ပါ။ health badge စိမ်းသွားပါက အဆင်ပြေပါသည်။
3. (သို့) `.env.local` တွင် `HF_VOXCPM2_URL=http://localhost:7860` ထားပြီး app ပြန်စပါ။

**Quality tuning (local server တွင်သာ)**

| Variable | Default | အကျိုးသက်ရောက်မှု |
| --- | --- | --- |
| `VOXCPM_DEVICE` | `auto` | `auto` / `cuda` / `mps` / `cpu` |
| `VOXCPM_TIMESTEPS` | `10` | Diffusion steps။ မြင့်လျှင် ပိုကောင်းသော်လည်း နှေးသည်။ `20`–`30` စမ်းကြည့်ပါ။ |
| `VOXCPM_PORT` | `7860` | Server port (app ၏ endpoint နှင့် ကိုက်ရမည်) |

## Validation Rules

Audio generation request များအတွက် အောက်ပါ rules များကို သတ်မှတ်ထားသည်။

| Field | Rule |
| --- | --- |
| Title | Optional၊ အများဆုံး `100` characters |
| Script | Required၊ `10` မှ `50,000` characters |
| Provider | `voxcpm2` (single engine) |
| Format | Final output အတွက် `wav` တစ်မျိုးတည်း |
| Speed | `0.8` မှ `1.2` |
| Emotion | `neutral`, `calm`, `energetic`, သို့မဟုတ် `dramatic` |
| Clone mode | Optional: `balanced` သို့မဟုတ် `high_fidelity` |
| Clone strength | Optional: `1.0` မှ `3.0` |
| Reference audio | VoxCPM2 cloning အတွက် required |
| Reference audio size | အများဆုံး `10 MB` |
| Reference audio duration | Duration ရရှိပါက အနည်းဆုံး `3` seconds နှင့် အများဆုံး `50` seconds |

## Long Scripts

Script အရှည်ကို အများဆုံး `50,000` characters အထိ လက်ခံသည်။

VoxCPM2 request များအတွက် script ကို အများဆုံး `420` characters ပါသော chunks များအဖြစ် ခွဲသည်။ Public VoxCPM2 Space က compressed MP3 chunk ပြန်ပေးလာသည်နှင့် Thalika သည် disk ပေါ်သို့ MP3 file မရေးမီ memory ထဲတွင် ချက်ချင်း decode လုပ်သည်။ ထို့နောက် real `48kHz` mono `24-bit PCM WAV` temporary chunk အဖြစ် validate လုပ်ပြီးမှ သိမ်းသည်။ Pipeline ၏ နောက်ဆက်တွဲအဆင့်များတွင် MP3 ကို မသုံးတော့ပါ။

Validated WAV chunks များကို `data/outputs/` အောက်ရှိ final `RIFF/WAVE` master file တစ်ခုအဖြစ် merge လုပ်ပြီး temporary folder ကို ဖျက်သည်။ Chunk boundary pause ကို punctuation အလိုက် ထည့်သည်။

| Chunk ending | Pause |
| --- | --- |
| `။`, `.`, `!`, `?` | `260ms` |
| `၊`, `,`, `;`, `:` | `160ms` |
| Explicit punctuation မရှိ | `120ms` |

Public Space သည် download မပြန်မီ upstream MP3 compression လုပ်ထားဆဲဖြစ်သည်။ Thalika ၏ immediate decode pipeline သည် download ပြီးနောက် ထပ်မံ compressed merge မလုပ်စေဘဲ downstream degradation ကို တားသည်။ Source-level WAV ကို ရရှိရန် WAV output ပေးနိုင်သော private သို့မဟုတ် self-hosted VoxCPM2 backend လိုအပ်သည်။

Long script generate လုပ်နေစဉ် chunk progress ကို သက်ဆိုင်ရာ `data/jobs/` Markdown file တွင် သိမ်းသည်။ Hugging Face request တစ်ခု အလွန်ကြာသွားပါက `HF_INFERENCE_TIMEOUT` ရောက်သောအခါ clean timeout ဖြစ်ပြီး retry လုပ်သည်။ Local diagnostics ကို `data/logs/generation.log` တွင် သိမ်းသည်။ ဤ log တွင် script စာသားနှင့် reference audio bytes မပါပါ။

## Local Storage

```text
data/
  scripts/              saved script Markdown files
  jobs/                 generation job Markdown files
  outputs/              generated PCM WAV master files
    legacy-backup/      migration မတိုင်မီ မူရင်း compressed audio backup files
  profiles/             consented local voice profile audio and JSON metadata
  reviews/              local Markdown listening QA reviews
  memory/
    MEMORY.md           local memory notes
    MEMORY.example.md   shareable memory note example
    voice-over-draft.json
    burmese-lexicon.json local pronunciation overrides
```

Script page နှင့် Voice Over page တို့သည် `data/memory/voice-over-draft.json` ကို shared draft အဖြစ် အသုံးပြုသည်။

`.env.local`, generated scripts, generation jobs, audio outputs, `MEMORY.md` နှင့် draft state များကို Git ထဲသို့ မတင်ရန် `.gitignore` တွင် တားထားသည်။ Share လုပ်နိုင်သော examples များအဖြစ် `.env.example`, folder `.gitkeep` files နှင့် `data/memory/MEMORY.example.md` ကို ထည့်ထားသည်။

## API Routes

| Method | Route | အသုံးပြုပုံ |
| --- | --- | --- |
| `GET` | `/api/health` | Local service health စစ်ခြင်း |
| `POST` | `/api/generate` | Audio generate လုပ်ခြင်း |
| `GET` | `/api/audio/{filename}` | Generated audio file ကို stream လုပ်ခြင်း |
| `GET` | `/api/history` | Generation jobs များကို ဖော်ပြခြင်း |
| `DELETE` | `/api/history/{jobId}` | Generation job ဖျက်ခြင်း |
| `PUT` | `/api/history/{jobId}/review` | Human listening QA score သိမ်းခြင်း |
| `GET` | `/api/scripts` | Saved scripts များကို ဖော်ပြခြင်း |
| `GET` | `/api/providers/capabilities` | Provider capability metadata ဖော်ပြခြင်း |
| `GET` | `/api/providers/voxcpm2/health` | VoxCPM2 Hugging Face Space ကို probe လုပ်ခြင်း |
| `POST` | `/api/rewrite` | Gemini ဖြင့် script rewrite လုပ်ခြင်း |
| `GET`, `POST` | `/api/settings/gemini` | Gemini API key state ဖတ်ခြင်း သို့မဟုတ် သိမ်းဆည်းခြင်း |
| `GET`, `POST`, `DELETE` | `/api/drafts/voice-over` | Shared Voice Over draft ဖတ်ခြင်း၊ သိမ်းဆည်းခြင်း သို့မဟုတ် ဖျက်ခြင်း |
| `POST` | `/api/burmese/normalize` | Burmese pronunciation preview ပြင်ဆင်ခြင်း |
| `GET`, `PUT` | `/api/settings/burmese-lexicon` | Local pronunciation lexicon ဖတ်ခြင်း သို့မဟုတ် သိမ်းခြင်း |
| `GET`, `POST` | `/api/voice-profiles` | Local voice profile များဖတ်ခြင်း သို့မဟုတ် consent ဖြင့် သိမ်းခြင်း |
| `DELETE` | `/api/voice-profiles/{profileId}` | Local voice profile နှင့် reference audio ဖျက်ခြင်း |
| `GET` | `/api/storage/local` | App-managed local folders များကို စစ်ဆေးခြင်း |
| `GET`, `POST` | `/api/storage/migrate-wav` | Legacy compressed outputs ကို စစ်ဆေးခြင်း သို့မဟုတ် explicit confirmation ဖြင့် PCM WAV ပြောင်းခြင်း |
| `GET`, `POST`, `DELETE` | `/api/voxcpm-local` | Local VoxCPM2 server status ကြည့်ခြင်း၊ start/stop လုပ်ခြင်း |

## Local Filesystem Boundaries

- Audio serving သည် `data/outputs/` အောက်မှသာ file ဖတ်သည်။
- Generated filenames များကို sanitize လုပ်သည်။
- Storage inspection တွင် သတ်မှတ်ထားသော app-managed folders များကိုသာ ဖော်ပြသည်။
- Electron folder opening သည် သတ်မှတ်ထားသော folder IDs များကိုသာ လက်ခံသည်။
- Provider inference သည် shell commands များကို execute မလုပ်ပါ။

## VoxCPM2 Health Badge

Voice Over page သည် `/api/providers/voxcpm2/health` ကို ခေါ်သည်။

Badge တွင် အောက်ပါ status များ ပေါ်နိုင်သည်။

- `HF connected`
- `HF timeout`
- `HF rate limited`
- `HF unavailable`
- `HF invalid response`

Health result သည် လက်ရှိ probe response ကို ဖော်ပြသည်။ Audio generation သည် သီးခြား remote request ဖြစ်သည်။

## Resource Commands

လက်ရှိ memory usage ကို စစ်ရန်:

```bash
npm run metrics:memory
```

CPU နှင့် RAM ကို sample ငါးကြိမ်ဖြင့် စစ်ရန်:

```bash
npm run metrics:resources
```

ဤ commands များသည် detected Thalika, Next.js နှင့် Electron runtime processes များကို report ပြသည်။ Remote Hugging Face resource usage ကို မပြပါ။

## Verification Commands

TypeScript စစ်ရန်:

```bash
npm run lint
```

Production build စစ်ရန်:

```bash
npm run build
```

## Troubleshooting

`Generate Local Audio` button ကို နှိပ်မရပါက အောက်ပါ အချက်များကို စစ်ပါ။

- Script length
- VoxCPM2 သို့မဟုတ် Burmese Production အတွက် reference audio upload
- Reference audio file size
- Reference audio duration

VoxCPM2 generation အလုပ်မလုပ်ပါက အောက်ပါ အချက်များကို စစ်ပါ။

- Internet connection
- VoxCPM2 health badge
- `HF_VOXCPM2_URL`
- `HF_REQUEST_TIMEOUT`
- `HF_INFERENCE_TIMEOUT`
- `data/logs/generation.log`

Gemini rewrite အလုပ်မလုပ်ပါက အောက်ပါ အချက်များကို စစ်ပါ။

- `GEMINI_API_KEY`
- `GEMINI_REQUEST_TIMEOUT`
- Configured Gemini API က ရွေးချယ်ထားသော model ကို လက်ခံခြင်း ရှိ၊ မရှိ

Electron binary cache မပြည့်စုံပါက:

```bash
npm run repair:electron
```
