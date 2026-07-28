# Thalika Professional Colab အသုံးပြုနည်း

## လိုအပ်ချက်

- Google Colab GPU runtime (T4 သို့မဟုတ် ပိုကောင်းသော GPU)
- High-RAM ရနိုင်လျှင် ပိုကောင်းသည်
- `Thalika_Colab.ipynb`
- `Thalika_Colab_Ready.zip`
- ကိုယ်ပိုင်အသံ သို့မဟုတ် အသံပိုင်ရှင်၏ ခွင့်ပြုချက်ရထားသော reference audio

## စတင်အသုံးပြုခြင်း

1. `Thalika_Colab.ipynb` ကို Google Colab တွင်ဖွင့်ပါ။
2. **Runtime → Change runtime type → T4 GPU** ကိုရွေးပါ။
3. **Run all** လုပ်ပါ။
4. ပထမ cell တောင်းသည့်အခါ `Thalika_Colab_Ready.zip` ကို upload လုပ်ပါ။
5. ပထမဆုံး run တွင် VoxCPM2 model (~8 GB) download လုပ်မည်ဖြစ်သောကြောင့် အချိန်ကြာနိုင်သည်။
6. Thalika window ပွင့်လာလျှင် script နှင့် reference audio ထည့်ပြီး generate လုပ်ပါ။

## Long paragraph workflow

စာပိုဒ်ရှည်ကို တစ်ခါတည်း paste လုပ်နိုင်သည်။ App က—

1. Burmese/English punctuation နှင့် safe text boundaries အလိုက် 180-character ဝန်းကျင် chunk များ ခွဲသည်။
2. Chunk အားလုံးတွင် voice identity နှင့် style တည်ငြိမ်စေရန် consistency seed တစ်ခုတည်းသုံးသည်။
3. Chunk တစ်ခုချင်းစီကို 48 kHz PCM WAV အဖြစ် validate လုပ်သည်။
4. Edge silence ကို ဖြတ်ပြီး chunk loudness ကို median speech level နှင့် ±3 dB အတွင်းညှိသည်။
5. Punctuation အလိုက် pause ထည့်သည်။
6. Output အားလုံးကို 48 kHz mono 24-bit PCM WAV တစ်ဖိုင်အဖြစ် merge လုပ်သည်။

## Recommended presets

### Professional narration

- Narration style: **Professional broadcast**
- Emotion: **Neutral** သို့မဟုတ် **Warm**
- Emotion intensity: **50–70%**
- Speed: **1.0x**
- Quality steps: **20–28**

### Movie recap

- Narration style: **Movie recap**
- Emotion: **Tense**, **Excited** သို့မဟုတ် **Dramatic**
- Emotion intensity: **70–85%**
- Speed: **1.0–1.1x**
- Quality steps: **24–32**

### Emotional storytelling

- Narration style: **Cinematic storyteller**
- Emotion: **Warm**, **Sad** သို့မဟုတ် **Hopeful**
- Emotion intensity: **65–85%**
- Speed: **0.9–1.0x**
- Quality steps: **24–32**

## မှတ်ချက်

- Emotion control သည် model ကို natural-language performance instruction ပေးခြင်းဖြစ်၍ အသံတိုင်းတွင် ရလဒ်တိတိကျကျတူမည်ဟု အာမခံမထားပါ။
- Cleaner reference audio (6–30 seconds၊ background music မပါ၊ one speaker) သည် quality အတွက် အရေးကြီးဆုံးဖြစ်သည်။
- Colab runtime ပိတ်လျှင် server ပိတ်သွားမည်။ Google Drive cache သုံးပါက model ပြန် download လုပ်ရမှု လျော့နိုင်သည်။
