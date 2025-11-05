import { GoogleGenAI, Part, Content } from "@google/genai";
// FIX: Import ChatPart to use the app's internal type for message construction.
import type { AttachedFile, ChatMessage, TextPart, ChatPart } from "../../../types";

/**
 * Counts tokens for the entire potential prompt payload using the official Google GenAI SDK.
 * This is an asynchronous operation that makes an API call.
 * @returns The total number of tokens, or -1 if an API key error occurs.
 */
export const countTotalTokens = async (
    apiKey: string, 
    model: string, 
    history: ChatMessage[], 
    prompt: string, 
    attachedFiles: AttachedFile[], 
    projectContext: string | null,
    projectContextPreamble: string
): Promise<number> => {
    if (!apiKey || !model) return 0;
    
    try {
        const ai = new GoogleGenAI({ apiKey });

        let historyForApi = [...history];
        
        // FIX: Use the internal ChatPart type which is compatible with ChatMessage.
        // The previous use of the SDK's `Part` type caused a mismatch because
        // the app's internal `FunctionResponsePart` has a required `name` while the SDK's is optional.
        const userParts: ChatPart[] = [];
        if (prompt) userParts.push({ text: prompt });
        attachedFiles.forEach(file => {
          const data = file.content.split(',')[1];
          if (data) {
            userParts.push({
              inlineData: {
                mimeType: file.type,
                data: data
              }
            });
          }
        });

        if (userParts.length > 0) {
             historyForApi.push({ role: 'user', parts: userParts });
        }

        let historyForApiWithContext = [...historyForApi];
        if (projectContext) {
             // Insert project context before the last user message
             const lastUserIndex = historyForApiWithContext.map(m => m.role).lastIndexOf('user');
             const insertIndex = lastUserIndex !== -1 ? lastUserIndex : historyForApiWithContext.length;
             historyForApiWithContext.splice(insertIndex, 0, { role: 'user', parts: [{ text: `${projectContextPreamble}\n\n${projectContext}`}] });
        }
        
        // Filter out any empty messages that might have been added
        const finalContents = historyForApiWithContext.filter(msg => msg.parts.length > 0);
        
        if (finalContents.length === 0) return 0;

        // The countTokens API requires alternating user/model roles.
        // We'll merge consecutive user messages to comply.
        const mergedContents: ChatMessage[] = [];
        for (const msg of finalContents) {
            const lastMsg = mergedContents[mergedContents.length - 1];
            if (lastMsg && lastMsg.role === 'user' && msg.role === 'user') {
                lastMsg.parts.push(...msg.parts);
            } else {
                mergedContents.push({ ...msg });
            }
        }
        
        const { totalTokens } = await ai.models.countTokens({
            model: model,
            contents: mergedContents as Content[],
        });
        return totalTokens;

    } catch (e) {
        console.error("Token counting failed:", e);
        if (e instanceof Error && (e.message.includes('API key not valid') || e.message.includes('API_KEY_INVALID'))) {
            return -1; // Specific signal for API key error
        }
        return 0; // Fail gracefully for other errors
    }
};


/**
 * A refined text token counter that provides a better approximation without an API call.
 * It uses a hybrid approach, taking the maximum of a character-based heuristic
 * and a word/punctuation-based heuristic. This provides a safer upper bound
 * that works reasonably well for both prose and code.
 * @param text The string to count tokens for.
 * @returns The estimated number of tokens.
 */
export const countTextTokensApprox = (text: string | undefined | null): number => {
    if (!text) return 0;

    // Heuristic 1: Character-based. Good for long words that get split into multiple tokens.
    // The classic "1 token ~ 4 chars" rule of thumb.
    const charTokens = Math.ceil(text.length / 4);

    // Heuristic 2: Word/punctuation-based. Good for code and prose with lots of punctuation.
    // This regex matches sequences of word characters (including apostrophes) or single non-word/non-space characters.
    const wordAndPunctuationTokens = text.match(/[\w']+|[^\s\w]/g)?.length || 0;
    
    // By taking the maximum of the two, we get a more robust estimate that is less
    // likely to severely undercount tokens for different types of text.
    return Math.max(charTokens, wordAndPunctuationTokens);
};

/**
 * A simplified image token counter without an API call.
 * This simulates a base cost plus a variable cost based on image dimensions.
 * It's an async operation as it needs to load the image to get its size.
 * @param file The AttachedFile object for the image.
 * @returns A promise that resolves to the estimated number of tokens.
 */
export const countImageTokensApprox = (file: AttachedFile): Promise<number> => {
    return new Promise((resolve) => {
        if (!file.content || !file.type.startsWith('image/')) {
            resolve(0);
            return;
        }

        const img = new Image();
        img.onload = () => {
            // A simplified formula simulating Gemini's image token cost.
            const fixedCost = 258;
            const pixels = img.width * img.height;
            // Rough approximation of cost per pixel block.
            const variableCost = Math.ceil(pixels / 700); 
            resolve(fixedCost + variableCost);
        };
        img.onerror = () => {
            console.error("Could not load image to count tokens for file:", file.name);
            resolve(258); // Return base cost on failure
        };
        img.src = file.content; // data URL
    });
};

/**
 * Counts tokens for a single chat message approximately.
 * @param message The ChatMessage to process.
 * @returns The estimated token count for the message.
 */
export const countMessageTokensApprox = (message: ChatMessage): number => {
    return message.parts.reduce((acc, part) => {
        if ('text' in part) {
            return acc + countTextTokensApprox((part as TextPart).text);
        }
        // Image tokens are handled separately via attachedFiles
        // as history doesn't store the full data URL needed for dimensions.
        return acc;
    }, 0);
};