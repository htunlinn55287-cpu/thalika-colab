export const GEMINI_REWRITE_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" }
] as const;

export type GeminiRewriteModel = (typeof GEMINI_REWRITE_MODELS)[number]["id"];
