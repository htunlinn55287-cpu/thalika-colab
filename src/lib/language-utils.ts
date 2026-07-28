import type { LanguageDetectionResult } from "./types";

const languageLabels: Record<LanguageDetectionResult["code"], string> = {
  unknown: "Unknown",
  my: "Burmese / Myanmar",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  yue: "Cantonese",
  de: "German",
  fr: "French",
  ru: "Russian",
  pt: "Portuguese",
  es: "Spanish",
  it: "Italian",
  mixed_supported: "Mixed supported languages"
};

function countMatches(value: string, regex: RegExp) {
  return Array.from(value.matchAll(regex)).length;
}

export function detectScriptLanguage(script: string): LanguageDetectionResult {
  const text = script.trim();
  if (!text) {
    return {
      code: "unknown",
      label: languageLabels.unknown,
      confidence: 0,
      reason: "No script text was provided."
    };
  }

  const totalSignals = Math.max(1, Array.from(text.replace(/\s/g, "")).length);
  const burmese = countMatches(text, /[\u1000-\u109F]/g);
  const japanese = countMatches(text, /[\u3040-\u30FF]/g);
  const korean = countMatches(text, /[\uAC00-\uD7AF]/g);
  const chinese = countMatches(text, /[\u3400-\u9FFF]/g);
  const latin = countMatches(text, /[A-Za-z]/g);

  const signals = [
    { code: "my" as const, count: burmese, reason: "Myanmar Unicode characters were detected." },
    { code: "ja" as const, count: japanese, reason: "Japanese kana characters were detected." },
    { code: "ko" as const, count: korean, reason: "Korean Hangul characters were detected." },
    { code: "zh" as const, count: chinese, reason: "CJK ideographs were detected." },
    { code: "en" as const, count: latin, reason: "Latin alphabet characters were detected." }
  ].sort((a, b) => b.count - a.count);

  const top = signals[0];
  if (!top || top.count === 0) {
    return {
      code: "unknown",
      label: languageLabels.unknown,
      confidence: 0.2,
      reason: "No strong language-specific writing system signal was detected."
    };
  }

  const second = signals[1];
  const confidence = Math.min(0.99, Math.max(0.4, top.count / totalSignals));
  const supportedMixed =
    top.code !== "my" &&
    second &&
    second.count > 0 &&
    ["en", "zh", "ja", "ko"].includes(top.code) &&
    ["en", "zh", "ja", "ko"].includes(second.code);

  if (supportedMixed) {
    return {
      code: "mixed_supported",
      label: languageLabels.mixed_supported,
      confidence,
      reason: "Multiple supported writing systems were detected."
    };
  }

  return {
    code: top.code,
    label: languageLabels[top.code],
    confidence,
    reason: top.reason
  };
}
