import { GoogleGenAI, Chat } from "@google/genai";
import type { ChatMessage } from '../types';

/**
 * Initiates a chat stream with the Google Gemini API.
 * @param apiKey - The user's Google AI API key.
 * @param modelName - The name of the model to use (e.g., 'gemini-flash-latest').
 * @param history - The conversation history to provide context.
 * @param systemInstruction - Optional system instruction to guide the model's behavior.
 * @returns A promise that resolves to the chat stream.
 * @throws An error if the API key is missing.
 */
export const runChat = async (apiKey: string, modelName: string, history: ChatMessage[], systemInstruction?: string) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please add it in settings.");
  }
  const ai = new GoogleGenAI({ apiKey });

  const chat: Chat = ai.chats.create({ 
    model: modelName,
    history: history.slice(0, -1), // All but the last message
    ...(systemInstruction && { config: { systemInstruction } }),
  });

  const lastMessage = history[history.length - 1];
  
  const result = await chat.sendMessageStream({ message: lastMessage.parts });

  return result;
};
