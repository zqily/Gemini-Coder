import { countTextTokens } from "../utils/tokenCounter";
import type { GenerateContentResponse } from "@google/genai";

const TPM_LIMITS = {
  'gemini-flash-latest': 250000,
  'gemini-2.5-pro': 125000,
};

interface RateLimitState {
  tokensUsedInWindow: number;
  windowStartTimestamp: number; // in milliseconds
}

const modelStates = new Map<string, RateLimitState>();

function getModelState(modelName: string): RateLimitState {
  if (!modelStates.has(modelName)) {
    modelStates.set(modelName, {
      tokensUsedInWindow: 0,
      windowStartTimestamp: 0,
    });
  }
  return modelStates.get(modelName)!;
}

function resetModelState(modelName: string) {
  modelStates.set(modelName, {
    tokensUsedInWindow: 0,
    windowStartTimestamp: 0,
  });
}

/**
 * Orchestrates batch API calls, respecting TPM rate limits.
 * It intelligently splits batches and introduces delays to stay within budget.
 * @param modelName The model being called.
 * @param inputTokensPerCall The estimated input tokens for each individual call in the batch.
 * @param cancellableSleep A sleep function that can be interrupted.
 * @param apiCalls An array of functions, each representing an API call to be made.
 * @param onStatusUpdate A callback to update the UI with status messages.
 * @returns A promise that resolves to an array of API call results or errors.
 */
export async function executeManagedBatchCall<T extends GenerateContentResponse>(
  modelName: string,
  inputTokensPerCall: number,
  cancellableSleep: (ms: number) => Promise<void>,
  apiCalls: (() => Promise<T>)[],
  onStatusUpdate: (message: string) => void
): Promise<(T | Error)[]> {
    const tpmLimit = TPM_LIMITS[modelName as keyof typeof TPM_LIMITS];
    if (!tpmLimit) {
        // Not a managed model, run all in parallel without rate limiting.
        return Promise.all(apiCalls.map(call => call().catch(e => e)));
    }

    const results: (T | Error)[] = [];
    const callsToMake = [...apiCalls];

    while (callsToMake.length > 0) {
        const state = getModelState(modelName);
        const now = Date.now();

        // Check if the current 60-second window has expired.
        if (state.windowStartTimestamp > 0 && now - state.windowStartTimestamp > 60000) {
            onStatusUpdate(`TPM window reset for ${modelName}.`);
            resetModelState(modelName);
        }

        const availableTpm = tpmLimit - getModelState(modelName).tokensUsedInWindow;
        // Ensure we don't try to make calls if input tokens alone exceed the limit
        const callsThatFit = inputTokensPerCall > 0 ? Math.max(0, Math.floor(availableTpm / inputTokensPerCall)) : callsToMake.length;
        
        if (callsThatFit > 0) {
            const batch = callsToMake.splice(0, Math.min(callsThatFit, callsToMake.length));
            onStatusUpdate(`TPM Manager: Executing batch of ${batch.length} API call(s) for ${modelName}.`);

            // Immediately account for the input tokens of the entire batch.
            const currentState = getModelState(modelName);
            if (currentState.windowStartTimestamp === 0) {
                currentState.windowStartTimestamp = Date.now();
            }
            currentState.tokensUsedInWindow += inputTokensPerCall * batch.length;
            
            const batchPromises = batch.map(call => 
                call().then(res => {
                    // Account for output tokens as each response arrives.
                    const outputTokens = countTextTokens(res.text);
                    getModelState(modelName).tokensUsedInWindow += outputTokens;
                    return res;
                }).catch(e => e)
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

        } else if (callsToMake.length > 0) {
            // If no calls fit, we must wait for the window to reset.
            const currentState = getModelState(modelName);
            // Calculate remaining time in the window, add a safety buffer.
            const delay = currentState.windowStartTimestamp > 0 
                ? Math.max(0, 60000 - (Date.now() - currentState.windowStartTimestamp)) + 2000
                : 2000; // If no window, just a small safety buffer.

            onStatusUpdate(`TPM Manager: Limit reached for ${modelName}. Waiting for ${Math.round(delay/1000)}s...`);
            await cancellableSleep(delay);
        }
    }
    
    return results;
}
