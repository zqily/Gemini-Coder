import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { ChatContext, ChatContextType } from './ChatContext';
import { useSelectedModel } from './useSelectedModel';
import { useSelectedMode } from './useSelectedMode';
import { generateContentWithRetries, generateContentStreamWithRetries } from './services/geminiService';
import type { ChatMessage, AttachedFile, ChatPart, TextPart } from '../../types';
import { MODES, NO_PROBLEM_DETECTED_TOOL } from './config/modes';
import { useSettings } from '../settings/SettingsContext';
import { Type, FunctionCall, GenerateContentResponse } from '@google/genai';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from './utils/fileUpload';
import { useFileSystem } from '../file-system/FileSystemContext';


interface ChatProviderProps {
  children: ReactNode;
  // Removed props as they are now consumed directly from FileSystemContext
  // getSerializableContext: () => string | null;
  // applyFunctionCalls: (functionCalls: FunctionCall[]) => Promise<ChatPart[]>;
  // unlinkProjectFs: () => void; // Filesystem unlink action
  // setCreatingInFs: (state: { path: string; type: 'file' | 'folder' } | null) => void; // Filesystem create in action
  // isReadingFilesFs: boolean; // Filesystem file reading status
}

// FIX: Ensure ChatProvider returns JSX.Element
const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  // Removed from props, now consumed via useFileSystem
  // getSerializableContext,
  // applyFunctionCalls,
  // unlinkProjectFs,
  // setCreatingInFs,
  // isReadingFilesFs,
}) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false); // Renamed from isLoading to avoid confusion with overall isLoading

  const cancellationRef = useRef(false);
  const fileAttachInputRef = useRef<HTMLInputElement>(null); // For chat attachments

  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [selectedMode, setSelectedMode] = useSelectedMode();

  const { apiKey, isStreamingEnabled, setIsSettingsModalOpen } = useSettings();

  // Directly consume FileSystemContext
  const { 
    getSerializableContext, 
    applyFunctionCalls, 
    unlinkProject: unlinkProjectFs, 
    setCreatingIn: setCreatingInFs, 
    isReadingFiles: isReadingFilesFs // Renamed to isReadingFilesFs for clarity in ChatContext
  } = useFileSystem();


  // Overall loading state combines chat processing and filesystem reading
  const isLoading = isChatProcessing || isReadingFilesFs;

  // If Advanced Coder is selected, disable streaming
  // FIX: This useEffect was not doing anything meaningful for disabling streaming.
  // Streaming logic will be handled directly within onSubmit based on mode and settings.
  // No explicit `setIsStreamingEnabled` call here.
  // The check is already done in PromptInput for `selectedMode === 'advanced-coder'`
  // and in `onSubmit` for `shouldUseStreaming`.
  /*
  useEffect(() => {
    if (selectedMode === 'advanced-coder') {
      // Logic for streaming will be handled within the onSubmit method directly
      // No need to persist this, as it's mode-dependent.
    }
  }, [selectedMode]);
  */

  const onStop = useCallback(() => {
    cancellationRef.current = true;
  }, []);

  const onNewChat = useCallback(() => {
    setChatHistory([]);
    setAttachedFiles([]);
    unlinkProjectFs(); // Clear associated file system project using passed prop
    setCreatingInFs(null); // Clear any pending file creation in file system
  }, [unlinkProjectFs, setCreatingInFs]);

  const onDeleteMessage = useCallback((indexToDelete: number) => {
    setChatHistory(prevHistory => {
        const messageToDelete = prevHistory[indexToDelete];
        if (!messageToDelete) return prevHistory;

        const nextMessage = prevHistory[indexToDelete + 1];
        const isModelWithFunctionCall = messageToDelete.role === 'model' && messageToDelete.parts.some(p => 'functionCall' in p);
        const isNextMessageToolResponse = nextMessage?.role === 'tool';

        if (isModelWithFunctionCall && isNextMessageToolResponse) {
            return prevHistory.filter((_, index) => index !== indexToDelete && index !== indexToDelete + 1);
        } else {
            return prevHistory.filter((_, index) => index !== indexToDelete);
        }
    });
  }, []);

  const onFileAddClick = useCallback(() => {
    if (fileAttachInputRef.current) {
        fileAttachInputRef.current.click();
    }
  }, []);

  const handleChatFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles: AttachedFile[] = [];
      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i];
        if (ALL_ACCEPTED_MIME_TYPES.includes(file.type) || Object.keys(CONVERTIBLE_TO_TEXT_MIME_TYPES).includes(file.type)) {
            const dataURL = await fileToDataURL(file);
            newFiles.push({
                name: file.name,
                type: CONVERTIBLE_TO_TEXT_MIME_TYPES[file.type] || file.type,
                size: file.size,
                content: dataURL,
            });
        } else {
            alert(`File type not supported: ${file.type}. Skipping ${file.name}.`);
        }
      }
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }
    event.target.value = ''; // Reset the input to allow selecting the same file again
  };

  const onSubmit = useCallback(async (prompt: string) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }

    let activeModel = selectedModel;
    if (selectedMode === 'advanced-coder') {
        // Advanced Coder always uses gemini-2.5-pro for core logic
        activeModel = 'gemini-2.5-pro';
    } else if (!activeModel) { // Only prompt for model selection if not advanced-coder
        alert("Please select a model before sending a prompt.");
        return;
    }

    // Capture attached files for the current turn before clearing state
    const filesForThisTurn = [...attachedFiles];

    let historyForApi: ChatMessage[];
    let isResend = false;

    // Determine the history to send to the API
    if (prompt.trim() || filesForThisTurn.length > 0) {
        const userParts: ChatPart[] = [];
        if (prompt) userParts.push({ text: prompt });
        filesForThisTurn.forEach(file => {
          userParts.push({
            inlineData: {
              mimeType: file.type,
              data: file.content.split(',')[1]
            }
          });
        });
        const newUserMessage: ChatMessage = { role: 'user', parts: userParts };
        historyForApi = [...chatHistory, newUserMessage];
        setChatHistory(historyForApi); // Update UI immediately with user's message
        setAttachedFiles([]); // Clear attached files after sending
    } else {
        // This is a resend scenario (empty prompt, but 'canResend' was true in PromptInput)
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage?.role === 'user') {
            historyForApi = [...chatHistory]; // Use existing history as is
            isResend = true;
        } else {
            return; // Should not happen due to PromptInput's disabled state, but a safeguard
        }
    }

    setIsChatProcessing(true);
    cancellationRef.current = false;

    const cancellableSleep = (ms: number) => {
        return new Promise<void>((resolve, reject) => {
            let intervalId: number | undefined;
            const timeoutId = setTimeout(() => {
                if(intervalId) clearInterval(intervalId);
                resolve();
            }, ms);

            intervalId = window.setInterval(() => {
                if (cancellationRef.current) {
                    clearTimeout(timeoutId);
                    clearInterval(intervalId!);
                    reject(new Error('Cancelled by user'));
                }
            }, 100);
        });
    };

    // Add a placeholder for the model's response if it's not a resend or if the last message isn't a model message.
    // If it's a resend and the last message IS a model message, we will overwrite it.
    // Otherwise, we append a new placeholder.
    if (!isResend || chatHistory[chatHistory.length - 1]?.role !== 'model') {
      setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
    }


    const onStatusUpdate = (message: string) => {
        setChatHistory(prev => {
            const newHistory = [...prev];
            const lastMessage = newHistory[newHistory.length - 1];
            if (lastMessage && lastMessage.role === 'model') {
                newHistory[newHistory.length - 1] = { ...lastMessage, parts: [{ text: message }] };
            }
            return newHistory;
        });
    };

    const extractTextWithoutThink = (rawText: string | undefined): string => {
        if (!rawText) return '';
        const startTag = '<think>';
        const endTag = '</think>';
        const firstStartTagIndex = rawText.indexOf(startTag);
        const lastEndTagIndex = rawText.lastIndexOf(endTag);
        if (firstStartTagIndex !== -1 && lastEndTagIndex !== -1 && firstStartTagIndex < lastEndTagIndex) {
            return rawText.substring(lastEndTagIndex + endTag.length).trim();
        }
        return rawText;
    };

    const getProjectContextStringLocal = (): string | null => {
        return getSerializableContext(); // This comes from FileSystemContext prop
    };

    const thinkPrimerMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: "Alright, before providing the final response, I will think step-by-step through the reasoning process and put it inside a <think> block using this format:\n\n```jsx\n<think>\nHuman request: (My interpretation of Human's request)\nHigh-level Plan: (A high level plan of what I'm going to do)\nDetailed Plan: (A more detailed plan that expands on the above plan)\n</think>\n```" }]
    };

    const fileOpsResponseSchema = {
        type: Type.OBJECT,
        properties: {
            summary: {
                type: Type.STRING,
                description: "A detailed summary of the changes made, explaining what was created/modified/deleted and why. This will be shown to the user. If the user asks for a simple script, write it here inside a markdown code block."
            },
            writeFiles: {
                type: Type.ARRAY,
                description: "A list of files to write content to. Creates the file if it does not exist, and overwrites it if it does.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        path: { type: Type.STRING },
                        content: { type: Type.STRING }
                    },
                    required: ['path', 'content']
                }
            },
            createFolders: {
                type: Type.ARRAY,
                description: "A list of new directories to create.",
                items: {
                    type: Type.OBJECT,
                    properties: { path: { type: Type.STRING } },
                    required: ['path']
                }
            },
            moves: {
                type: Type.ARRAY,
                description: "A list of files or folders to move/rename.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        sourcePath: { type: Type.STRING },
                        destinationPath: { type: Type.STRING }
                    },
                    required: ['sourcePath', 'destinationPath']
                }
            },
            deletePaths: {
                type: Type.ARRAY,
                description: "A list of files or folders to delete.",
                items: {
                    type: Type.OBJECT,
                    properties: { path: { type: Type.STRING } },
                    required: ['path']
                }
            }
        },
        required: ['summary']
    };

    try {
        if (selectedMode === 'advanced-coder') {
            let baseHistory = [...historyForApi];
            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer.`;
                baseHistory.splice(baseHistory.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}` }] });
            }

            // Phase 1: Planning
            onStatusUpdate('Phase 1/6: Generating initial plans...');
            const plannerSystemInstruction = `You are a Senior Software Architect. Your task is to create a high-level plan to address the user's request. Do NOT write any code. Focus on the overall strategy, file structure, and key components.`;
            const planningPromises = Array(3).fill(0).map(() =>
                generateContentWithRetries(apiKey, 'gemini-flash-latest', [...baseHistory, thinkPrimerMessage], plannerSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep).catch(e => e)
            );
            const planningResults = await Promise.all(planningPromises);
            const successfulPlans = planningResults
                .filter((res): res is GenerateContentResponse => !(res instanceof Error) && res.text)
                .map(res => extractTextWithoutThink(res.text));

            if (successfulPlans.length === 0) throw new Error("All planning instances failed.");

            await cancellableSleep(5000);

            // Phase 2: Consolidation
            onStatusUpdate('Phase 2/6: Consolidating into a master plan...');
            const consolidationSystemInstruction = `You are a Principal Engineer. Your task is to synthesize multiple high-level plans from your team of architects into a single, cohesive, and highly detailed master plan. The final plan should be actionable for a skilled developer. Do not reference the previous planning phase or the planners themselves; present this as your own unified plan.`;
            const consolidationHistory = [...baseHistory];
            consolidationHistory.push({ role: 'user', parts: [{ text: `Here are the plans from the architects:\n\n${successfulPlans.map((p, i) => `--- PLAN ${i+1} ---\n${p}`).join('\n\n')}` }] });
            consolidationHistory.push(thinkPrimerMessage);
            const consolidationResult = await generateContentWithRetries(apiKey, 'gemini-2.5-pro', consolidationHistory, consolidationSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep);
            const masterPlan = extractTextWithoutThink(consolidationResult.text);

            await cancellableSleep(5000);

            // Phase 3: Drafting
            onStatusUpdate('Phase 3/6: Drafting code...');
            const draftingSystemInstruction = `You are a Staff Engineer. Your task is to generate a complete code draft based on the master plan. The output should be in a diff format where applicable. Do not use any function tools.`;
            const draftingHistory = [...baseHistory];
            draftingHistory.push({ role: 'user', parts: [{ text: `Here is the master plan. Please generate the code draft.\n\n${masterPlan}` }] });
            draftingHistory.push(thinkPrimerMessage);
            const draftingResult = await generateContentWithRetries(apiKey, 'gemini-2.5-pro', draftingHistory, draftingSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep);
            const codeDraft = extractTextWithoutThink(draftingResult.text);

            await cancellableSleep(5000);

            // Phase 4: Debugging
            onStatusUpdate('Phase 4/6: Debugging draft...');
            const debuggerSystemInstruction = `You are a meticulous Code Reviewer. Review the provided code draft for critical errors, bugs, incomplete implementation, or violations of best practices. If the draft is acceptable, you MUST call the \`noProblemDetected\` function. Otherwise, provide your feedback. Do not reference the "Master Plan" or the source of the reasoning.`;
            const debuggingHistory = [...baseHistory];
            debuggingHistory.push({ role: 'user', parts: [{ text: `Master Plan:\n${masterPlan}\n\nCode Draft:\n${codeDraft}` }] });
            debuggingHistory.push(thinkPrimerMessage);
            const debuggingPromises = Array(3).fill(0).map(() =>
                generateContentWithRetries(apiKey, 'gemini-flash-latest', debuggingHistory, debuggerSystemInstruction, [{ functionDeclarations: [NO_PROBLEM_DETECTED_TOOL] }], cancellationRef, onStatusUpdate, cancellableSleep).catch(e => e)
            );
            const debuggingResults = await Promise.all(debuggingPromises);

            const debuggingReports: string[] = [];
            let noProblemCount = 0;
            for (const res of debuggingResults) {
                if (res instanceof Error) continue;
                const hasNoProblemCall = res.functionCalls?.some(fc => fc.name === 'noProblemDetected');
                if (hasNoProblemCall) noProblemCount++;
                else if (res.text) debuggingReports.push(extractTextWithoutThink(res.text));
            }

            const phase5Skipped = noProblemCount === 3;
            let consolidatedReview = '';

            await cancellableSleep(5000);

            // Phase 5: Review Consolidation
            if (!phase5Skipped && debuggingReports.length > 0) {
                onStatusUpdate('Phase 5/6: Consolidating feedback...');
                const reviewConsolidationSystemInstruction = `You are a Tech Lead. Consolidate the following debugging feedback into a single, concise list of required changes for the final implementation. Do not reference the debuggers or the source of the comments.`;
                const reviewHistory = [...baseHistory];
                reviewHistory.push({ role: 'user', parts: [{ text: `Code Draft:\n${codeDraft}\n\nDebugging Reports:\n${debuggingReports.join('\n---\n')}` }] });
                reviewHistory.push(thinkPrimerMessage);
                const reviewResult = await generateContentWithRetries(apiKey, 'gemini-flash-latest', reviewHistory, reviewConsolidationSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep);
                consolidatedReview = extractTextWithoutThink(reviewResult.text);
                await cancellableSleep(5000);
            }

            // Phase 6: Final Implementation (JSON based)
            onStatusUpdate('Phase 6/6: Generating final implementation...');
            const finalSystemInstruction = `You are a file system operations generator. Your sole purpose is to generate a JSON object representing all necessary file system operations and a summary for the user.

Your entire output MUST be a single JSON object that strictly adheres to the provided schema. Do not output any other text, reasoning, or markdown. The JSON object must contain:
1.  A 'summary' (string): A detailed, user-facing explanation of the changes.
2.  'writeFiles' (array, optional): An array of objects, each with 'path' and 'content', for files to be created or overwritten.
3.  'createFolders' (array, optional): An array of objects, each with a 'path' for new directories.
4.  'moves' (array, optional): An array of objects, each with 'sourcePath' and 'destinationPath'.
5.  'deletePaths' (array, optional): An array of objects, each with a 'path' to be deleted.`;

            const finalHistory = [...baseHistory];
            const finalUserContent = `Here is the context for the final implementation. Generate the JSON output containing the summary and file system operations.\n\nCode Draft:\n${codeDraft}\n\n${consolidatedReview ? `Consolidated Review:\n${consolidatedReview}` : 'No issues were found in the draft.'}`;
            finalHistory.push({ role: 'user', parts: [{ text: finalUserContent }] });

            const finalImplementationConfig = { responseMimeType: "application/json", responseSchema: fileOpsResponseSchema };
            const response = await generateContentWithRetries(apiKey, 'gemini-2.5-pro', finalHistory, finalSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep, finalImplementationConfig);

            if (cancellationRef.current) throw new Error('Cancelled by user');

            let summaryText = '';
            let functionCalls: FunctionCall[] = [];

            try {
                const jsonResponse = JSON.parse(response.text);
                summaryText = jsonResponse.summary || "No summary provided.";
                functionCalls = [];
                if (jsonResponse.writeFiles && Array.isArray(jsonResponse.writeFiles)) {
                    jsonResponse.writeFiles.forEach((op: any) => {
                        functionCalls.push({ name: 'writeFile', args: { path: op.path, content: op.content } });
                    });
                }
                if (jsonResponse.createFolders && Array.isArray(jsonResponse.createFolders)) {
                    jsonResponse.createFolders.forEach((op: any) => {
                        functionCalls.push({ name: 'createFolder', args: { path: op.path } });
                    });
                }
                if (jsonResponse.moves && Array.isArray(jsonResponse.moves)) {
                    jsonResponse.moves.forEach((op: any) => {
                        functionCalls.push({ name: 'move', args: { sourcePath: op.sourcePath, destinationPath: op.destinationPath } });
                    });
                }
                if (jsonResponse.deletePaths && Array.isArray(jsonResponse.deletePaths)) {
                    jsonResponse.deletePaths.forEach((op: any) => { // FIX: Correct variable name from jsonCalls to functionCalls and op.
                        functionCalls.push({ name: 'deletePath', args: { path: op.path } });
                    });
                }
            } catch (e) {
                console.error("Failed to parse JSON response from model:", response.text, e);
                summaryText = `An error occurred while processing the model's response. The raw response is provided below.\n\n---\n\n\`\`\`json\n${response.text}\n\`\`\``;
            }

            if (!summaryText && functionCalls.length === 0) {
                // If no summary and no operations, remove the placeholder model message
                setChatHistory(prev => prev.slice(0, -1));
            } else {
                const modelTurnParts: ChatPart[] = [];
                if (summaryText) modelTurnParts.push({ text: summaryText });
                functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));

                const modelTurnWithMessage: ChatMessage = { role: 'model', parts: modelTurnParts };

                setChatHistory(prev => {
                    const newHistory = [...prev];
                    // Overwrite the last placeholder model message
                    newHistory[newHistory.length - 1] = modelTurnWithMessage;
                    return newHistory;
                });

                if (functionCalls.length > 0) {
                    if (cancellationRef.current) throw new Error('Cancelled by user');
                    const functionResponses: ChatPart[] = await applyFunctionCalls(functionCalls);

                    if (cancellationRef.current) throw new Error('Cancelled by user');

                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                }
            }
        } else if (selectedMode === 'simple-coder') {
            let historyForApiWithContext = [...historyForApi]; // Use the already constructed historyForApi
            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                 const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer.`;
                 historyForApiWithContext.splice(historyForApiWithContext.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}`}] });
            }
            historyForApiWithContext.push(thinkPrimerMessage); // Add think primer

            const systemInstruction = MODES['simple-coder'].systemInstruction!;
            const modelConfig = { responseMimeType: "application/json", responseSchema: fileOpsResponseSchema };

            // Use Pro model for reliability with JSON schema
            const response = await generateContentWithRetries(apiKey, activeModel, historyForApiWithContext, systemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep, modelConfig);
            if (cancellationRef.current) throw new Error('Cancelled by user');

            let summaryText = '';
            let functionCalls: FunctionCall[] = [];

            try {
                const jsonResponse = JSON.parse(response.text);
                summaryText = jsonResponse.summary || "No summary provided.";

                functionCalls = [];
                if (jsonResponse.writeFiles && Array.isArray(jsonResponse.writeFiles)) {
                    jsonResponse.writeFiles.forEach((op: any) => {
                        functionCalls.push({ name: 'writeFile', args: { path: op.path, content: op.content } });
                    });
                }
                if (jsonResponse.createFolders && Array.isArray(jsonResponse.createFolders)) {
                    jsonResponse.createFolders.forEach((op: any) => {
                        functionCalls.push({ name: 'createFolder', args: { path: op.path } });
                    });
                }
                if (jsonResponse.moves && Array.isArray(jsonResponse.moves)) {
                    jsonResponse.moves.forEach((op: any) => {
                        functionCalls.push({ name: 'move', args: { sourcePath: op.sourcePath, destinationPath: op.destinationPath } });
                    });
                }
                if (jsonResponse.deletePaths && Array.isArray(jsonResponse.deletePaths)) {
                    jsonResponse.deletePaths.forEach((op: any) => { // FIX: Corrected loop variable and push target
                        functionCalls.push({ name: 'deletePath', args: { path: op.path } });
                    });
                }
            } catch (e) {
                console.error("Failed to parse JSON response from model:", response.text, e);
                summaryText = `An error occurred while processing the model's response. The raw response is provided below.\n\n---\n\n\`\`\`json\n${response.text}\n\`\`\``;
            }

            if (!summaryText && functionCalls.length === 0) {
                setChatHistory(prev => prev.slice(0, -1));
            } else {
                 const modelTurnParts: ChatPart[] = [];
                if (summaryText) modelTurnParts.push({ text: summaryText });
                functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));

                const modelTurnWithMessage: ChatMessage = { role: 'model', parts: modelTurnParts };

                setChatHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[newHistory.length - 1] = modelTurnWithMessage;
                    return newHistory;
                });

                if (functionCalls.length > 0) {
                    if (cancellationRef.current) throw new Error('Cancelled by user');
                    const functionResponses: ChatPart[] = await applyFunctionCalls(functionCalls);

                    if (cancellationRef.current) throw new Error('Cancelled by user');

                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                }
            }

        } else {
            // Default mode
            let historyForApiWithContext = [...historyForApi]; // Use the already constructed historyForApi
            // For default mode, streaming is controlled by user setting
            const shouldUseStreaming = isStreamingEnabled && selectedMode === 'default';

            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                 const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer. Do not mention this context message in your response unless the user asks about it.`;
                 historyForApiWithContext.splice(historyForApiWithContext.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}`}] });
            }

            const mode = MODES[selectedMode];
            const systemInstruction = mode.systemInstruction;

            if (shouldUseStreaming) {
                const stream = generateContentStreamWithRetries( apiKey, activeModel, historyForApiWithContext, systemInstruction, cancellationRef, onStatusUpdate, cancellableSleep );
                let fullResponseText = '';
                for await (const chunk of stream) {
                    if (cancellationRef.current) break;
                    const chunkText = chunk.text;
                    if (chunkText) {
                        fullResponseText += chunkText;
                        setChatHistory(prev => {
                            const newHistory = [...prev];
                            const lastMessage = newHistory[newHistory.length - 1];
                            if (lastMessage && lastMessage.role === 'model') {
                                newHistory[newHistory.length - 1] = { ...lastMessage, parts: [{ text: fullResponseText }] };
                            }
                            return newHistory;
                        });
                    }
                }
                if (cancellationRef.current) throw new Error('Cancelled by user');
                if (!fullResponseText.trim()) setChatHistory(prev => prev.slice(0, -1));
            } else {
                const response = await generateContentWithRetries( apiKey, activeModel, historyForApiWithContext, systemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep );
                if (cancellationRef.current) throw new Error('Cancelled by user');
                const modelResponseText = response.text;

                if (!modelResponseText.trim()) { // FIX: Check if modelResponseText is empty after trim()
                    setChatHistory(prev => prev.slice(0, -1));
                } else {
                    const modelTurnWithMessage: ChatMessage = { role: 'model', parts: [{ text: modelResponseText }] };
                    setChatHistory(prev => {
                        const newHistory = [...prev];
                        newHistory[newHistory.length - 1] = modelTurnWithMessage;
                        return newHistory;
                    });
                }
            }
        }
    } catch (error) {
      console.error("A critical error occurred during prompt submission:", error);
      const errorMessageText = error instanceof Error ? error.message : 'An unknown error occurred';
      if (errorMessageText !== 'Cancelled by user') {
          const errorMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessageText}` }] };
          setChatHistory(prev => {
              const newHistory = [...prev];
              newHistory[newHistory.length - 1] = errorMessage;
              return newHistory;
          });
      } else {
          // If cancelled by user, remove the last placeholder model message
          setChatHistory(prev => prev.slice(0, -1));
      }
    } finally {
      setIsChatProcessing(false);
      cancellationRef.current = false;
    }
  }, [
    apiKey, chatHistory, selectedModel, selectedMode, isStreamingEnabled,
    setIsSettingsModalOpen, getSerializableContext, applyFunctionCalls, attachedFiles,
    unlinkProjectFs, setCreatingInFs, isReadingFilesFs
  ]);


  const contextValue: ChatContextType = {
    chatHistory,
    isLoading, // overall isLoading
    attachedFiles,
    isReadingFilesFs, // From filesystem context
    selectedModel,
    selectedMode,
    modes: MODES,
    setAttachedFiles,
    setSelectedModel,
    onSubmit,
    onStop,
    onNewChat,
    setSelectedMode,
    onDeleteMessage,
    onFileAddClick,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      {/* Hidden input for attaching files directly to chat */}
      <input
        type="file"
        multiple
        ref={fileAttachInputRef}
        onChange={handleChatFileChange}
        className="hidden"
        aria-label="Attach files to chat"
      />
    </ChatContext.Provider>
  );
};

export default ChatProvider;