import type { AttachedFile, ChatMessage, ChatPart, TextPart } from "../../../types";

/**
 * A simplified text token counter.
 * Approximation: 1 token ~ 4 characters.
 * @param text The string to count tokens for.
 * @returns The estimated number of tokens.
 */
export const countTextTokens = (text: string | undefined | null): number => {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
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
