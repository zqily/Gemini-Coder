import type { AttachedFile, ChatMessage, ChatPart, TextPart } from "../../../types";

/**
 * A refined text token counter that provides a better approximation.
 * It uses a hybrid approach, taking the maximum of a character-based heuristic
 * and a word/punctuation-based heuristic. This provides a safer upper bound
 * that works reasonably well for both prose and code.
 * @param text The string to count tokens for.
 * @returns The estimated number of tokens.
 */
export const countTextTokens = (text: string | undefined | null): number => {
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
 * A simplified image token counter.
 * This simulates a base cost plus a variable cost based on image dimensions.
 * It's an async operation as it needs to load the image to get its size.
 * @param file The AttachedFile object for the image.
 * @returns A promise that resolves to the estimated number of tokens.
 */
export const countImageTokens = (file: AttachedFile): Promise<number> => {
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
 * Counts tokens for a single chat message.
 * @param message The ChatMessage to process.
 * @returns The estimated token count for the message.
 */
export const countMessageTokens = (message: ChatMessage): number => {
    return message.parts.reduce((acc, part) => {
        if ('text' in part) {
            return acc + countTextTokens((part as TextPart).text);
        }
        // Image tokens are handled separately via attachedFiles
        // as history doesn't store the full data URL needed for dimensions.
        return acc;
    }, 0);
};