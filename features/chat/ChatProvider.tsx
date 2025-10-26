import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { ChatContext, ChatContextType } from './ChatContext';
import { useSelectedModel } from './useSelectedModel';
import { useSelectedMode } from './useSelectedMode';
import { generateContentWithRetries, generateContentStreamWithRetries } from './services/geminiService';
import { executeManagedBatchCall } from './services/rateLimitManager';
import type { ChatMessage, AttachedFile, ChatPart, TextPart } from '../../types';
import { MODES, NO_PROBLEM_DETECTED_TOOL } from './config/modes';
import { useSettings } from '../settings/SettingsContext';
import { Type, FunctionCall, GenerateContentResponse } from '@google/genai';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from './utils/fileUpload';
import { useFileSystem } from '../file-system/FileSystemContext';
import { countTextTokens, countImageTokens, countMessageTokens } from './utils/tokenCounter';


interface ChatProviderProps {
  children: ReactNode;
}

const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
}) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [totalTokens, setTotalTokens] = useState(0);

  const cancellationRef = useRef(false);
  const fileAttachInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [selectedMode, setSelectedMode] = useSelectedMode();

  const { apiKey, isStreamingEnabled, setIsSettingsModalOpen } = useSettings();

  const { 
    getSerializableContext, 
    applyFunctionCalls, 
    unlinkProject: unlinkProjectFs, 
    setCreatingIn: setCreatingInFs, 
    isReadingFiles: isReadingFilesFs
  } = useFileSystem();


  const isLoading = isChatProcessing || isReadingFilesFs;
  
  // Token Calculation Effect
  useEffect(() => {
    const calculateTokens = async () => {
      // Defer calculation to avoid blocking render
      await new Promise(resolve => setTimeout(resolve, 50));

      const promptTokens = countTextTokens(prompt);
      const historyTokens = chatHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
      const projectContextString = getSerializableContext();
      const projectContextTokens = countTextTokens(projectContextString);

      const imagePromises = attachedFiles
        .filter(file => file.type.startsWith('image/'))
        .map(countImageTokens);
      
      const imageTokensArray = await Promise.all(imagePromises);
      const imageTokens = imageTokensArray.reduce((sum, count) => sum + count, 0);

      const attachedTextTokens = attachedFiles
        .filter(file => !file.type.startsWith('image/'))
        .reduce((sum, file) => {
            try {
                const base64Content = file.content.split(',')[1];
                if (base64Content) {
                    const textContent = atob(base64Content);
                    return sum + countTextTokens(textContent);
                }
                return sum;
            } catch (e) {
                console.error("Failed to decode attached file for token counting:", file.name);
                return sum;
            }
        }, 0);
        
      setTotalTokens(
        promptTokens +
        historyTokens +
        projectContextTokens +
        imageTokens +
        attachedTextTokens
      );
    };

    calculateTokens();
  }, [prompt, chatHistory, attachedFiles, getSerializableContext]);

  const onStop = useCallback(() => {
    cancellationRef.current = true;
  }, []);

  const onNewChat = useCallback(() => {
    setChatHistory([]);
    setAttachedFiles([]);
    setPrompt('');
    unlinkProjectFs();
    setCreatingInFs(null);
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
    event.target.value = '';
  };

  const onSubmit = useCallback(async (currentPrompt: string) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }

    let activeModel = selectedModel;
    if (selectedMode === 'advanced-coder') {
        activeModel = 'gemini-2.5-pro';
    } else if (!activeModel) {
        alert("Please select a model before sending a prompt.");
        return;
    }

    const filesForThisTurn = [...attachedFiles];
    let historyForApi: ChatMessage[];
    let isResend = false;

    if (currentPrompt.trim() || filesForThisTurn.length > 0) {
        const userParts: ChatPart[] = [];
        if (currentPrompt) userParts.push({ text: currentPrompt });
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
        setChatHistory(historyForApi);
        setAttachedFiles([]);
        setPrompt('');
    } else {
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage?.role === 'user') {
            historyForApi = [...chatHistory];
            isResend = true;
        } else {
            return;
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
        return getSerializableContext();
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
            const planningHistoryForTokens = [...baseHistory, thinkPrimerMessage];
            const plannerInputTokens = planningHistoryForTokens.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
            
            const planningApiCalls = Array(3).fill(0).map(() =>
                () => generateContentWithRetries(apiKey, 'gemini-flash-latest', planningHistoryForTokens, plannerSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep)
            );

            const planningResults = await executeManagedBatchCall(
                'gemini-flash-latest',
                plannerInputTokens,
                cancellableSleep,
                planningApiCalls,
                onStatusUpdate
            );
            
            const successfulPlans = planningResults
                .filter((res): res is GenerateContentResponse => !(res instanceof Error) && !!res.text)
                .map(res => extractTextWithoutThink(res.text));

            if (successfulPlans.length === 0) throw new Error("All planning instances failed.");

            // Phase 2: Consolidation
            onStatusUpdate('Phase 2/6: Consolidating into a master plan...');
            const consolidationSystemInstruction = `You are a Principal Engineer. Your task is to synthesize multiple high-level plans from your team of architects into a single, cohesive, and highly detailed master plan. The final plan should be actionable for a skilled developer. Do not reference the previous planning phase or the planners themselves; present this as your own unified plan.`;
            const consolidationHistory = [...baseHistory];
            consolidationHistory.push({ role: 'user', parts: [{ text: `Here are the plans from the architects:\n\n${successfulPlans.map((p, i) => `--- PLAN ${i+1} ---\n${p}`).join('\n\n')}` }] });
            consolidationHistory.push(thinkPrimerMessage);

            const consolidationInputTokens = consolidationHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
            const consolidationApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', consolidationHistory, consolidationSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep)];
            
            const consolidationResult = (await executeManagedBatchCall('gemini-2.5-pro', consolidationInputTokens, cancellableSleep, consolidationApiCall, onStatusUpdate))[0];
            if (consolidationResult instanceof Error) throw consolidationResult;
            const masterPlan = extractTextWithoutThink(consolidationResult.text);

            // Phase 3: Drafting
            onStatusUpdate('Phase 3/6: Drafting code...');
            const draftingSystemInstruction = `You are a Staff Engineer. Your task is to generate a complete code draft based on the master plan. The output should be in a diff format where applicable. Do not use any function tools.`;
            const draftingHistory = [...baseHistory];
            draftingHistory.push({ role: 'user', parts: [{ text: `Here is the master plan. Please generate the code draft.\n\n${masterPlan}` }] });
            draftingHistory.push(thinkPrimerMessage);

            const draftingInputTokens = draftingHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
            const draftingApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', draftingHistory, draftingSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep)];
            const draftingResult = (await executeManagedBatchCall('gemini-2.5-pro', draftingInputTokens, cancellableSleep, draftingApiCall, onStatusUpdate))[0];
            if (draftingResult instanceof Error) throw draftingResult;
            const codeDraft = extractTextWithoutThink(draftingResult.text);


            // Phase 4: Debugging
            onStatusUpdate('Phase 4/6: Debugging draft...');
            const debuggerSystemInstruction = `You are a meticulous Code Reviewer. Review the provided code draft for critical errors, bugs, incomplete implementation, or violations of best practices. If the draft is acceptable, you MUST call the \`noProblemDetected\` function. Otherwise, provide your feedback. Do not reference the "Master Plan" or the source of the reasoning.`;
            const debuggingHistory = [...baseHistory];
            debuggingHistory.push({ role: 'user', parts: [{ text: `Master Plan:\n${masterPlan}\n\nCode Draft:\n${codeDraft}` }] });
            debuggingHistory.push(thinkPrimerMessage);

            const debuggingInputTokens = debuggingHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
            const debuggingApiCalls = Array(3).fill(0).map(() =>
                () => generateContentWithRetries(apiKey, 'gemini-flash-latest', debuggingHistory, debuggerSystemInstruction, [{ functionDeclarations: [NO_PROBLEM_DETECTED_TOOL] }], cancellationRef, onStatusUpdate, cancellableSleep)
            );
            const debuggingResults = await executeManagedBatchCall('gemini-flash-latest', debuggingInputTokens, cancellableSleep, debuggingApiCalls, onStatusUpdate);
            
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

            // Phase 5: Review Consolidation
            if (!phase5Skipped && debuggingReports.length > 0) {
                onStatusUpdate('Phase 5/6: Consolidating feedback...');
                const reviewConsolidationSystemInstruction = `You are a Tech Lead. Consolidate the following debugging feedback into a single, concise list of required changes for the final implementation. Do not reference the debuggers or the source of the comments.`;
                const reviewHistory = [...baseHistory];
                reviewHistory.push({ role: 'user', parts: [{ text: `Code Draft:\n${codeDraft}\n\nDebugging Reports:\n${debuggingReports.join('\n---\n')}` }] });
                reviewHistory.push(thinkPrimerMessage);

                const reviewInputTokens = reviewHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                const reviewApiCall = [() => generateContentWithRetries(apiKey, 'gemini-flash-latest', reviewHistory, reviewConsolidationSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep)];
                const reviewResult = (await executeManagedBatchCall('gemini-flash-latest', reviewInputTokens, cancellableSleep, reviewApiCall, onStatusUpdate))[0];
                if (reviewResult instanceof Error) throw reviewResult;
                consolidatedReview = extractTextWithoutThink(reviewResult.text);
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
            
            const finalInputTokens = finalHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
            const finalApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', finalHistory, finalSystemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep, finalImplementationConfig)];
            const response = (await executeManagedBatchCall('gemini-2.5-pro', finalInputTokens, cancellableSleep, finalApiCall, onStatusUpdate))[0];
            
            if (response instanceof Error) throw response;

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
                    jsonResponse.deletePaths.forEach((op: any) => {
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
        } else if (selectedMode === 'simple-coder') {
            let historyForApiWithContext = [...historyForApi];
            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                 const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer.`;
                 historyForApiWithContext.splice(historyForApiWithContext.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}`}] });
            }
            historyForApiWithContext.push(thinkPrimerMessage);

            const systemInstruction = MODES['simple-coder'].systemInstruction!;
            const modelConfig = { responseMimeType: "application/json", responseSchema: fileOpsResponseSchema };

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
                    jsonResponse.deletePaths.forEach((op: any) => {
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
            let historyForApiWithContext = [...historyForApi];
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

                if (!modelResponseText.trim()) {
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
          setChatHistory(prev => prev.slice(0, -1));
      }
    } finally {
      setIsChatProcessing(false);
      cancellationRef.current = false;
    }
  }, [
    apiKey, chatHistory, selectedModel, selectedMode, isStreamingEnabled,
    setIsSettingsModalOpen, getSerializableContext, applyFunctionCalls, attachedFiles,
    unlinkProjectFs, setCreatingInFs
  ]);


  const contextValue: ChatContextType = {
    chatHistory,
    isLoading,
    attachedFiles,
    isReadingFilesFs,
    selectedModel,
    selectedMode,
    modes: MODES,
    prompt,
    setPrompt,
    totalTokens,
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
