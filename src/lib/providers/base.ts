import type { GenerateVoiceInput, GenerateVoiceResult, VoiceProvider } from "../types";

export interface TTSProvider {
  id: VoiceProvider;
  name: string;
  generate(input: GenerateVoiceInput): Promise<GenerateVoiceResult>;
}
