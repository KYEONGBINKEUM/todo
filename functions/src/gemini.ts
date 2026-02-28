import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export interface GeminiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Call Gemini with a system prompt and user prompt.
 * Uses gemini-2.0-flash for speed and cost efficiency.
 * Requests JSON output when jsonMode is true.
 */
export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean = true
): Promise<GeminiResult> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: jsonMode
      ? { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 4096 }
      : { temperature: 0.7, maxOutputTokens: 4096 },
  });

  const result: GenerateContentResult = await model.generateContent(userPrompt);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  return {
    text,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}
