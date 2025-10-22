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


/**
 * A wrapper for `generateContentStream` that adds robust retry logic for API errors.
 * @param apiKey - The user's Google AI API key.
 * @param modelName - The name of the model to use.
 * @param history - The full conversation history.
 * @param systemInstruction - Optional system instruction.
 * @param tools - Optional function calling tools.
 * @param cancellationRef - A React ref to check if the user has cancelled the request.
 * @param onStatusUpdate - A callback to update the UI with status messages (e.g., "Retrying...").
 * @param cancellableSleep - A sleep function that can be interrupted by the cancellationRef.
 * @returns A promise that resolves to the generation stream, or throws an error if all retries fail.
 */
export const generateContentStreamWithRetries = async (
  apiKey: string,
  modelName: string,
  history: ChatMessage[],
  systemInstruction: string | undefined,
  tools: { functionDeclarations: FunctionDeclaration[] }[] | undefined,
  cancellationRef: React.MutableRefObject<boolean>,
  onStatusUpdate: (message: string) => void,
  cancellableSleep: (ms: number) => Promise<void>
) => {
    let retries503 = 0;
    const initialDelay503 = 10000;
    const increment503 = 5000;
    const maxDelay503 = 30000;

    let retriesOther = 0;
    const maxRetriesOther = 3;
    const delaysOther = [30000, 45000, 60000];
    
    while (true) {
        if (cancellationRef.current) {
            throw new Error("Cancelled by user");
        }
        
        try {
            const stream = await generateContentStream(apiKey, modelName, history, systemInstruction, tools);
            return stream; // Success, return stream and exit loop
        } catch (error: any) {
            if (cancellationRef.current) throw error;

            let statusCode: number | undefined;
            const message = error instanceof Error ? error.message : String(error);
            // Attempt to parse status code from standard Gemini error message format e.g., "[429]..."
            const match = message.match(/\[(\d{3})\]/);
            if (match && match[1]) {
                statusCode = parseInt(match[1], 10);
            }

            console.error(`API Error (status: ${statusCode}):`, error);
            
            if (statusCode === 500) {
                onStatusUpdate(`Error: A server error occurred. The input context may be too long. Please shorten your prompt or reduce the number of attached files.\n\nDetails: ${message}`);
                throw error; // Abort instantly
            }
            
            if (statusCode === 503) {
                const delay = Math.min(initialDelay503 + retries503 * increment503, maxDelay503);
                retries503++;
                onStatusUpdate(`Model is overloaded. Retrying in ${delay / 1000}s...`);
                await cancellableSleep(delay);
                retriesOther = 0; // Reset other error counter
                continue; // Retry
            }

            // Handle 429 and other retryable errors
            if (retriesOther < maxRetriesOther) {
                const delay = delaysOther[retriesOther];
                const attempt = retriesOther + 1;
                const userMessage = statusCode === 429
                    ? `API rate limit reached. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetriesOther})`
                    : `An unknown error occurred. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetriesOther})`;
                
                retriesOther++;
                onStatusUpdate(userMessage);
                await cancellableSleep(delay);
                retries503 = 0; // Reset 503 error counter
                continue; // Retry
            } else {
                onStatusUpdate(`Error: Maximum retries reached for this issue. Please try again later.\n\nDetails: ${message}`);
                throw error; // All retries failed, abort
            }
        }
    }
};
