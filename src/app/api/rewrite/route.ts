import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GEMINI_REWRITE_MODELS,
  type GeminiRewriteModel
} from "@/lib/script-rewrite";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";
import { getGeminiApiKey } from "@/lib/storage/env-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().trim().max(100).optional().or(z.literal("")),
  script: z
    .string()
    .trim()
    .min(10, "Script must be at least 10 characters")
    .max(MAX_SCRIPT_CHARACTERS, `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer`),
  model: z.enum(GEMINI_REWRITE_MODELS.map((item) => item.id) as [GeminiRewriteModel, ...GeminiRewriteModel[]]),
  keepBurmese: z.boolean().optional()
});

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

class GeminiTimeoutError extends Error {
  constructor() {
    super("Gemini request timed out.");
    this.name = "GeminiTimeoutError";
  }
}

function getGeminiRequestTimeout() {
  const parsed = Number(process.env.GEMINI_REQUEST_TIMEOUT || 60000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
}

async function fetchGeminiWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGeminiRequestTimeout());

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input: z.infer<typeof requestSchema>) {
  const languageInstruction = input.keepBurmese ?? true
    ? "Keep the rewritten script in Burmese/Myanmar language. Do not translate it into English."
    : "Keep the original language unless the text clearly asks for another language.";

  return [
    "You are a senior narration script editor for a professional Myanmar movie-recap (movie summary / cinematic storytelling) YouTube channel.",
    "Convert the user's original script into a narration-ready reading script optimized for a movie-recap voice-over.",
    languageInstruction,
    "Do not change the story, plot events, facts, names, numbers, claims, message, or intent. Never invent details that are not in the original script.",
    "Open with a strong hook in the first one or two sentences that grabs attention immediately — a striking question, a shocking moment, or a tense situation from the story. Do not start with a slow, generic introduction.",
    "Build and maintain curiosity throughout: use short, punchy sentences at tense or dramatic moments, and let information unfold rather than dumping all plot details at once.",
    "If the script covers a full story, keep a light cliffhanger feeling before major reveals rather than flatly stating outcomes — but never withhold facts that are already stated plainly in the original script.",
    "If the script sounds like part of a series/episode, end with a brief line that makes the listener want to watch the next part. Do not add this if the original script does not suggest a series.",
    "Do not add documentary, warm story, brand, social, or any other separate style category.",
    "Do not add headings, markdown, bullet points, explanations, scene labels, speaker labels, or bracketed directions that a TTS engine might read aloud.",
    "Polish it for cinematic spoken delivery: add natural pauses using punctuation, short sentence breaks, ellipses at suspenseful beats, smoother breath points, and clearer emphasis through wording and rhythm.",
    "Use punctuation and line breaks to suggest voice rise/fall and pacing — favor shorter sentences over long, flat ones so the narration feels energetic rather than monotone.",
    "Avoid making it much longer than the original. Output only the final narration-ready script.",
    input.title ? `Title context: ${input.title}` : "",
    "Original script:",
    input.script
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function callGemini(input: z.infer<typeof requestSchema>) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Gemini API key is not configured.",
        message: "Add GEMINI_API_KEY to .env.local, then restart the app."
      },
      { status: 503 }
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchGeminiWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input) }]
        }
      ],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    })
  });

  let json: GeminiResponse;
  try {
    json = (await response.json()) as GeminiResponse;
  } catch {
    return NextResponse.json(
      { status: "failed", error: "Invalid Gemini response.", message: "Gemini returned a response the app could not parse." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Gemini script rewrite failed.",
        message: json.error?.message || "Gemini returned an error."
      },
      { status: response.status }
    );
  }

  const rewrittenScript = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!rewrittenScript) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Gemini returned an empty rewrite.",
        message: "Try a different model or shorten the script."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "completed",
    title: input.title || "Narration Rewrite",
    originalCharacterCount: input.script.length,
    rewrittenCharacterCount: rewrittenScript.length,
    model: input.model,
    rewrittenScript
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "failed", error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "failed", error: parsed.error.issues.map((issue) => issue.message).join(". ") },
      { status: 400 }
    );
  }

  try {
    return await callGemini(parsed.data);
  } catch (error) {
    if (error instanceof GeminiTimeoutError) {
      return NextResponse.json(
        {
          status: "failed",
          error: "Gemini script rewrite timed out.",
          message: "Gemini took too long to respond. Try a shorter script or increase GEMINI_REQUEST_TIMEOUT."
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        status: "failed",
        error: "Gemini script rewrite failed.",
        message: error instanceof Error ? error.message : "Could not rewrite the script."
      },
      { status: 500 }
    );
  }
}
