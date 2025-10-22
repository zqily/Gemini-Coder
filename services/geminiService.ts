
// FIX: Remove deprecated GenerateContentRequest type.
import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import type { ChatMessage } from '../types';

/**
 * Initiates a content generation stream with the Google Gemini API.
 * This is used instead of the Chat API to allow for more complex, multi-turn
 * function calling scenarios.
 * @param apiKey - The user's Google AI API key.
 * @param modelName - The name of the model to use.
 * @param history - The full conversation history.
 * @param systemInstruction - Optional system instruction.
 * @param tools - Optional function calling tools.
 * @returns A promise that resolves to the generation stream.
 */
export const generateContentStream = async (
  apiKey: string,
  modelName: string,
  history: ChatMessage[],
  systemInstruction?: string,
  tools?: { functionDeclarations: FunctionDeclaration[] }[]
) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please add it in settings.");
  }
  const ai = new GoogleGenAI({ apiKey });

  // The config needs to be constructed carefully, as some properties might be undefined.
  const config: { systemInstruction?: string, tools?: any } = {};
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (tools) config.tools = tools;

  // FIX: The request object is passed directly to the method.
  const request = {
    model: modelName,
    contents: history,
    config,
  };

  const result = await ai.models.generateContentStream(request);

  // FIX: `generateContentStream` now returns the stream iterator directly.
  return result;
};
