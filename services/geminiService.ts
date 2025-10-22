
import { GoogleGenAI, Chat } from "@google/genai";
import type { ChatMessage } from '../types';

// FIX: Update function signature to remove apiKey.
export const runChat = async (modelName: string, history: ChatMessage[]) => {
  // FIX: API Key must be read from environment variables.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  // FIX: Use the new chat API `ai.chats.create` instead of deprecated `ai.models.create`.
  const chat: Chat = ai.chats.create({ 
    model: modelName,
    history: history.slice(0, -1) // All but the last message
  });

  const lastMessage = history[history.length - 1];
  
  // FIX: The `sendMessageStream` takes an object with a `message` property.
  // The parts from the last message are passed here.
  const result = await chat.sendMessageStream({ message: lastMessage.parts });

  return result;
};
