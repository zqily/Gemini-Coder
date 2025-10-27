import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { ChatContext, ChatContextType } from './ChatContext';
import { useSelectedModel } from './useSelectedModel';
import { useSelectedMode } from './useSelectedMode';
import { generateContentWithRetries, generateContentStreamWithRetries } from './services/geminiService';
import { executeManagedBatchCall } from './services/rateLimitManager';
import type { ChatMessage, AttachedFile, ChatPart, TextPart, AdvancedCoderState } from '../../types';
import { MODES, NO_PROBLEM_DETECTED_TOOL } from './config/modes';
import { useSettings } from '../settings/SettingsContext';
import { FunctionCall, GenerateContentResponse } from '@google/genai';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from './utils/fileUpload';
import { useFileSystem } from '../file-system/FileSystemContext';
import { countTextTokens, countImageTokens, countMessageTokens } from './utils/tokenCounter';
import { useToast } from '../toast/ToastContext';


interface ChatProviderProps {
  children: ReactNode;
}

interface CommandMatch {
    commandLine: string;
    command: string;
    args: string[];
    index: number;
}

/**
 * Parses the model's text response to extract a summary and file system commands.
 * This function is designed to be robust against formatting variations from the model.
 * It dynamically chooses a parsing strategy based on the presence of `--- START OF ---` blocks.
 * @param responseText The raw text from the model.
 * @returns An object with the user-facing summary and an array of FunctionCall objects.
 */
const parseHybridResponse = (responseText: string): { summary: string; functionCalls: FunctionCall[] } => {
    if (!responseText) {
        return { summary: '', functionCalls: [] };
    }

    const functionCalls: FunctionCall[] = [];
    const hasContentBlocks = /--- START OF .*?---/i.test(responseText);

    // If we detect `--- START OF ---` blocks, we prioritize a block-based parsing strategy.
    // This handles cases where the model lists commands first, then all file contents.
    if (hasContentBlocks) {
        let summary = responseText;

        // 1. Extract all content blocks using their START/END markers.
        const contentBlockRegex = /--- START OF (?:FILE: )?(.*?) ---\r?\n([\s\S]*?)\r?\n--- END OF (?:FILE: )?.*?---\r?\n?/gi;
        
        summary = summary.replace(contentBlockRegex, (match, path, content) => {
            const cleanedPath = path.trim();
            if (!cleanedPath) return match; // Don't process blocks with empty paths

            let fileContent = content.trim();
            fileContent = fileContent.replace(/^```[a-z]*\r?\n/, '');
            fileContent = fileContent.replace(/\r?\n```$/, '');
            functionCalls.push({ name: 'writeFile', args: { path: cleanedPath, content: fileContent.trim() } });
            
            return ''; // Remove this block from the text to be processed further
        });

        // 2. Remove any `@@writeFile` commands, as their content has been handled.
        summary = summary.replace(/^(@@writeFile\s+.*)\r?\n?/gm, '');

        // 3. Parse the rest of the text for other commands.
        const commandRegex = /^(@@\w+)\s*(.*)/gm;
        
        const remainingTextWithoutOtherCommands = summary.replace(commandRegex, (match, command, argsLine) => {
            const args = argsLine.trim().split(/\s+/).filter(Boolean);
            switch (command) {
                case '@@moves': {
                    const [sourcePath, destinationPath] = args;
                    if (sourcePath && destinationPath) {
                        functionCalls.push({ name: 'move', args: { sourcePath, destinationPath } });
                    }
                    return ''; // Remove command line
                }
                case '@@createFolder': {
                    const [path] = args;
                    if (path) {
                        functionCalls.push({ name: 'createFolder', args: { path } });
                    }
                    return '';
                }
                case '@@deletePaths': {
                    const [path] = args;
                    if (path) {
                        functionCalls.push({ name: 'deletePath', args: { path } });
                    }
                    return '';
                }
                default:
                    return match; // Keep unknown commands in the text
            }
        });
        
        summary = remainingTextWithoutOtherCommands.trim().replace(/(\r?\n){3,}/g, '\n\n');
        return { summary: summary.trim(), functionCalls };

    } else {
        // Fallback to the original logic for interleaved commands if no START/END blocks are detected.
        const commandRegex = /^(@@\w+)\s*(.*)/gm;
        const matches: CommandMatch[] = [];
        let match;

        while ((match = commandRegex.exec(responseText)) !== null) {
            const command = match[1];
            const argsLine = match[2].trim();
            matches.push({
                commandLine: match[0],
                command: command,
                args: argsLine.split(/\s+/).filter(Boolean),
                index: match.index
            });
        }

        if (matches.length === 0) {
            return { summary: responseText, functionCalls: [] };
        }

        let summary = responseText.substring(0, matches[0].index);

        for (let i = 0; i < matches.length; i++) {
            const currentMatch = matches[i];
            const nextMatch = matches[i + 1];

            const contentStartIndex = currentMatch.index + currentMatch.commandLine.length;
            const contentEndIndex = nextMatch ? nextMatch.index : responseText.length;
            
            let content = responseText.substring(contentStartIndex, contentEndIndex);

            switch (currentMatch.command) {
                case '@@writeFile': {
                    const path = currentMatch.args[0];
                    if (!path) {
                        summary += `\n${currentMatch.commandLine}${content}`;
                        continue;
                    }

                    let fileContent = content.trim();
                    fileContent = fileContent.replace(/^--- START OF .*? ---\r?\n/i, '');
                    fileContent = fileContent.replace(/\r?\n--- END OF .*? ---$/i, '');
                    fileContent = fileContent.replace(/^```[a-z]*\r?\n/, '');
                    fileContent = fileContent.replace(/\r?\n```$/, '');
                    
                    functionCalls.push({ name: 'writeFile', args: { path: path.trim(), content: fileContent.trim() } });
                    break;
                }
                case '@@moves': {
                    const sourcePath = currentMatch.args[0];
                    const destinationPath = currentMatch.args[1];
                    if (sourcePath && destinationPath) {
                        functionCalls.push({ name: 'move', args: { sourcePath, destinationPath } });
                    } else {
                         summary += `\n${currentMatch.commandLine}`;
                    }
                    summary += content;
                    break;
                }
                case '@@createFolder': {
                    const path = currentMatch.args[0];
                    if (path) {
                        functionCalls.push({ name: 'createFolder', args: { path } });
                    } else {
                        summary += `\n${currentMatch.commandLine}`;
                    }
                    summary += content;
                    break;
                }
                case '@@deletePaths': {
                    const path = currentMatch.args[0];
                    if (path) {
                        functionCalls.push({ name: 'deletePath', args: { path } });
                    } else {
                        summary += `\n${currentMatch.commandLine}`;
                    }
                    summary += content;
                    break;
                }
                default:
                    summary += `\n${currentMatch.commandLine}${content}`;
                    break;
            }
        }

        summary = summary.trim().replace(/(\r?\n){3,}/g, '\n\n');
        return { summary: summary.trim(), functionCalls };
    }
};

const initialAdvancedCoderState: AdvancedCoderState = {
  phases: [
    { id: 'planning', title: 'Phase 1/6: Planning', status: 'pending', subtasks: [] },
    { id: 'consolidation', title: 'Phase 2/6: Consolidation', status: 'pending' },
    { id: 'drafting', title: 'Phase 3/6: Drafting', status: 'pending' },
    { id: 'debugging', title: 'Phase 4/6: Debugging', status: 'pending', subtasks: [] },
    { id: 'review', title: 'Phase 5/6: Review Consolidation', status: 'pending' },
    { id: 'final', title: 'Phase 6/6: Final Implementation', status: 'pending' },
  ],
  statusMessage: '',
};

const updatePhase = (prevState: AdvancedCoderState | null, phaseId: string, updates: object): AdvancedCoderState | null => {
    if (!prevState) return null;
    const newPhases = prevState.phases.map(p => p.id === phaseId ? { ...p, ...updates } : p);
    return { ...prevState, phases: newPhases };
};


const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
}) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [totalTokens, setTotalTokens] = useState(0);
  const [advancedCoderState, setAdvancedCoderState] = useState<AdvancedCoderState | null>(null);

  const cancellationRef = useRef(false);
  const fileAttachInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [selectedMode, setSelectedMode] = useSelectedMode();

  const { apiKey, isStreamingEnabled, setIsSettingsModalOpen } = useSettings();
  const { showToast } = useToast();

  const { 
    projectContext,
    getSerializableContext, 
    applyFunctionCalls, 
    clearProjectContext,
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
    const resetAll = () => {
      setChatHistory([]);
      setAttachedFiles([]);
      setPrompt('');
      clearProjectContext();
      setCreatingInFs(null);
      setAdvancedCoderState(null);
    };

    if (projectContext || chatHistory.length > 0 || prompt.trim() || attachedFiles.length > 0) {
      if (window.confirm('Start a new chat? This will clear the current conversation and file context.')) {
        resetAll();
      }
      // If user cancels, do nothing.
    } else {
      resetAll(); // Nothing to lose, reset without confirmation.
    }
  }, [chatHistory, projectContext, clearProjectContext, setCreatingInFs, prompt, attachedFiles]);

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
      const files = Array.from(event.target.files);
      
      for (const file of files) {
        if (ALL_ACCEPTED_MIME_TYPES.includes(file.type) || Object.keys(CONVERTIBLE_TO_TEXT_MIME_TYPES).includes(file.type)) {
            const dataURL = await fileToDataURL(file);
            newFiles.push({
                name: file.name,
                type: CONVERTIBLE_TO_TEXT_MIME_TYPES[file.type] || file.type,
                size: file.size,
                content: dataURL,
            });
        } else {
            showToast(`File type not supported: ${file.type}. Skipping ${file.name}.`, 'error');
        }
      }

      if (newFiles.length > 0) {
        setAttachedFiles(prev => [...prev, ...newFiles]);
        if (newFiles.length === 1) {
            showToast(`Attached file: ${newFiles[0].name}`, 'success');
        } else {
            showToast(`Attached ${newFiles.length} files.`, 'success');
        }
      }
    }
    event.target.value = '';
  };

  const onSubmit = useCallback(async (currentPrompt: string) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }

    setAdvancedCoderState(null);

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
      setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }], mode: selectedMode }]);
    }
    
    const getProjectContextStringLocal = (): string | null => {
        return getSerializableContext();
    };

    const projectContextPreamble = `The user has provided a project context. This includes a list of all folders, and a list of all files with their full paths and content. All paths are relative to the project root. Use this information to understand the project structure and answer the user's request. When performing file operations, you MUST use the exact paths provided.`;
    const projectContextPreambleForDefault = `The user has provided a project context. This includes a list of all folders, and a list of all files with their full paths and content. All paths are relative to the project root. Use this information to understand the project structure and answer the user's request. Do not mention this context message in your response unless the user asks about it.`;

    try {
        if (selectedMode === 'advanced-coder') {
            const onStatusUpdateForRetries = (message: string) => {
                setAdvancedCoderState(prev => (prev ? { ...prev, statusMessage: message } : null));
            };

            setAdvancedCoderState(initialAdvancedCoderState);
            
            try {
                let baseHistory = [...historyForApi];
                const projectFileContext = getProjectContextStringLocal();
                if (projectFileContext) {
                    baseHistory.splice(baseHistory.length - 1, 0, { role: 'user', parts: [{ text: `${projectContextPreamble}\n\n${projectFileContext}` }] });
                }

                // Phase 1: Planning
                setAdvancedCoderState(prev => updatePhase(prev, 'planning', { status: 'running' }));
                const plannerSystemInstruction = `You are a Senior Software Architect. Your task is to create a high-level plan to address the user's request. Do NOT write any code. Focus on the overall strategy, file structure, and key components.`;
                const planningHistoryForTokens = [...baseHistory];
                const plannerInputTokens = planningHistoryForTokens.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                
                const planningApiCalls = Array(3).fill(0).map(() =>
                    () => generateContentWithRetries(apiKey, 'gemini-flash-latest', planningHistoryForTokens, plannerSystemInstruction, undefined, cancellationRef, onStatusUpdateForRetries, cancellableSleep)
                );

                const planningResults = await executeManagedBatchCall('gemini-flash-latest', plannerInputTokens, cancellableSleep, planningApiCalls, onStatusUpdateForRetries);
                if (cancellationRef.current) throw new Error("Cancelled by user");

                const successfulPlans = planningResults
                    .map((res, i) => ({
                        title: `Planner ${i+1} Output`,
                        content: (res instanceof Error || !res.text) ? `Error: ${res instanceof Error ? res.message : 'No output'}` : res.text
                    }));

                setAdvancedCoderState(prev => updatePhase(prev, 'planning', { status: 'completed', subtasks: successfulPlans }));
                if (planningResults.every(res => res instanceof Error)) throw new Error("All planning instances failed.");

                // Phase 2: Consolidation
                setAdvancedCoderState(prev => updatePhase(prev, 'consolidation', { status: 'running' }));
                const consolidationSystemInstruction = `You are a Principal Engineer. Your task is to synthesize multiple high-level plans from your team of architects into a single, cohesive, and highly detailed master plan. The final plan should be actionable for a skilled developer. Do not reference the previous planning phase or the planners themselves; present this as your own unified plan.`;
                const consolidationHistory = [...baseHistory];
                const successfulPlanContents = successfulPlans.filter(p => !p.content.startsWith('Error:')).map(p => p.content);
                consolidationHistory.push({ role: 'user', parts: [{ text: `Here are the plans from the architects:\n\n${successfulPlanContents.map((p, i) => `--- PLAN ${i+1} ---\n${p}`).join('\n\n')}` }] });

                const consolidationInputTokens = consolidationHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                const consolidationApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', consolidationHistory, consolidationSystemInstruction, undefined, cancellationRef, onStatusUpdateForRetries, cancellableSleep)];
                
                const consolidationResult = (await executeManagedBatchCall('gemini-2.5-pro', consolidationInputTokens, cancellableSleep, consolidationApiCall, onStatusUpdateForRetries))[0];
                if (cancellationRef.current) throw new Error("Cancelled by user");
                if (consolidationResult instanceof Error) throw consolidationResult;
                const masterPlan = consolidationResult.text;
                setAdvancedCoderState(prev => updatePhase(prev, 'consolidation', { status: 'completed', output: masterPlan }));
                
                // Phase 3: Drafting
                setAdvancedCoderState(prev => updatePhase(prev, 'drafting', { status: 'running' }));
                const draftingSystemInstruction = `You are a Staff Engineer. Your task is to generate a complete code draft based on the master plan. The output should be in a diff format where applicable. Do not use any function tools.`;
                const draftingHistory = [...baseHistory];
                draftingHistory.push({ role: 'user', parts: [{ text: `Here is the master plan. Please generate the code draft.\n\n${masterPlan}` }] });

                const draftingInputTokens = draftingHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                const draftingApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', draftingHistory, draftingSystemInstruction, undefined, cancellationRef, onStatusUpdateForRetries, cancellableSleep)];
                const draftingResult = (await executeManagedBatchCall('gemini-2.5-pro', draftingInputTokens, cancellableSleep, draftingApiCall, onStatusUpdateForRetries))[0];
                if (cancellationRef.current) throw new Error("Cancelled by user");
                if (draftingResult instanceof Error) throw draftingResult;
                const codeDraft = draftingResult.text;
                setAdvancedCoderState(prev => updatePhase(prev, 'drafting', { status: 'completed', output: codeDraft }));


                // Phase 4: Debugging
                setAdvancedCoderState(prev => updatePhase(prev, 'debugging', { status: 'running' }));
                const debuggerSystemInstruction = `You are a meticulous Code Reviewer. Review the provided code draft for critical errors, bugs, incomplete implementation, or violations of best practices. If the draft is acceptable, you MUST call the \`noProblemDetected\` function. Otherwise, provide your feedback. Do not reference the "Master Plan" or the source of the reasoning.`;
                const debuggingHistory = [...baseHistory];
                debuggingHistory.push({ role: 'user', parts: [{ text: `Master Plan:\n${masterPlan}\n\nCode Draft:\n${codeDraft}` }] });

                const debuggingInputTokens = debuggingHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                const debuggingApiCalls = Array(3).fill(0).map(() =>
                    () => generateContentWithRetries(apiKey, 'gemini-flash-latest', debuggingHistory, debuggerSystemInstruction, [{ functionDeclarations: [NO_PROBLEM_DETECTED_TOOL] }], cancellationRef, onStatusUpdateForRetries, cancellableSleep)
                );
                const debuggingResults = await executeManagedBatchCall('gemini-flash-latest', debuggingInputTokens, cancellableSleep, debuggingApiCalls, onStatusUpdateForRetries);
                if (cancellationRef.current) throw new Error("Cancelled by user");
                
                const debuggingReports: string[] = [];
                let noProblemCount = 0;
                const debuggerSubtasks = debuggingResults.map((res, i) => {
                    if (res instanceof Error) return { title: `Debugger ${i+1} Output`, content: `Error: ${res.message}` };
                    const hasNoProblemCall = res.functionCalls?.some(fc => fc.name === 'noProblemDetected');
                    if (hasNoProblemCall) {
                        noProblemCount++;
                        return { title: `Debugger ${i+1} Output`, content: 'No problems detected.' };
                    }
                    const reportText = res.text;
                    if (reportText) debuggingReports.push(reportText);
                    return { title: `Debugger ${i+1} Output`, content: reportText || 'No feedback provided.' };
                });
                setAdvancedCoderState(prev => updatePhase(prev, 'debugging', { status: 'completed', subtasks: debuggerSubtasks }));


                const phase5Skipped = noProblemCount === 3;
                let consolidatedReview = '';

                // Phase 5: Review Consolidation
                if (!phase5Skipped && debuggingReports.length > 0) {
                    setAdvancedCoderState(prev => updatePhase(prev, 'review', { status: 'running' }));
                    const reviewConsolidationSystemInstruction = `You are a Tech Lead. Consolidate the following debugging feedback into a single, concise list of required changes for the final implementation. Do not reference the debuggers or the source of the comments.`;
                    const reviewHistory = [...baseHistory];
                    reviewHistory.push({ role: 'user', parts: [{ text: `Code Draft:\n${codeDraft}\n\nDebugging Reports:\n${debuggingReports.join('\n---\n')}` }] });

                    const reviewInputTokens = reviewHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                    const reviewApiCall = [() => generateContentWithRetries(apiKey, 'gemini-flash-latest', reviewHistory, reviewConsolidationSystemInstruction, undefined, cancellationRef, onStatusUpdateForRetries, cancellableSleep)];
                    const reviewResult = (await executeManagedBatchCall('gemini-flash-latest', reviewInputTokens, cancellableSleep, reviewApiCall, onStatusUpdateForRetries))[0];
                    if (cancellationRef.current) throw new Error("Cancelled by user");
                    if (reviewResult instanceof Error) throw reviewResult;
                    consolidatedReview = reviewResult.text;
                    setAdvancedCoderState(prev => updatePhase(prev, 'review', { status: 'completed', output: consolidatedReview }));
                } else {
                     setAdvancedCoderState(prev => updatePhase(prev, 'review', { status: 'skipped' }));
                }

                // Phase 6: Final Implementation
                setAdvancedCoderState(prev => updatePhase(prev, 'final', { status: 'running' }));
                const finalSystemInstruction = `You are a file system operations generator. Your sole purpose is to generate a user-facing summary and all necessary file system operations based on the provided context.

Your entire output **MUST** use the following format. Any text that is not part of a command block will be considered the summary.

- **Write/Overwrite a file:**
  @@writeFile path/to/file
  (The full content of the file goes on the following lines)

- **Create a folder:**
  @@createFolder path/to/folder

- **Move/Rename a file or folder:**
  @@moves source/path destination/path

- **Delete a file or folder:**
  @@deletePaths path/to/folder_or_file

Ensure your response is complete and contains all necessary file operations.`;

                const finalHistory = [...baseHistory];
                const finalUserContent = `Here is the context for the final implementation. Generate the file system operations.\n\nCode Draft:\n${codeDraft}\n\n${consolidatedReview ? `Consolidated Review:\n${consolidatedReview}` : 'No issues were found in the draft.'}`;
                finalHistory.push({ role: 'user', parts: [{ text: finalUserContent }] });
                
                const finalInputTokens = finalHistory.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
                const finalApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', finalHistory, finalSystemInstruction, undefined, cancellationRef, onStatusUpdateForRetries, cancellableSleep)];
                const response = (await executeManagedBatchCall('gemini-2.5-pro', finalInputTokens, cancellableSleep, finalApiCall, onStatusUpdateForRetries))[0];
                
                if (cancellationRef.current) throw new Error("Cancelled by user");
                if (response instanceof Error) throw response;
                
                setAdvancedCoderState(prev => updatePhase(prev, 'final', { status: 'completed', output: response.text }));
                
                const { summary: summaryText, functionCalls } = parseHybridResponse(response.text);

                if (!summaryText && functionCalls.length === 0) {
                    setChatHistory(prev => prev.slice(0, -1));
                } else {
                    const modelTurnParts: ChatPart[] = [];
                    if (summaryText) modelTurnParts.push({ text: summaryText });
                    functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));

                    const modelTurnWithMessage: ChatMessage = { role: 'model', parts: modelTurnParts, mode: selectedMode };

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
            } catch (phaseError) {
                setAdvancedCoderState(prev => {
                    if (!prev) return null;
                    const runningPhaseIndex = prev.phases.findIndex(p => p.status === 'running');
                    if (runningPhaseIndex > -1) {
                        const newPhases = [...prev.phases];
                        newPhases[runningPhaseIndex] = { ...newPhases[runningPhaseIndex], status: 'error' };
                        return { ...prev, phases: newPhases };
                    }
                    return prev;
                });
                throw phaseError; // Re-throw to be caught by the outer handler
            }

        } else if (selectedMode === 'simple-coder') {
            let historyForApiWithContext = [...historyForApi];
            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                 historyForApiWithContext.splice(historyForApiWithContext.length - 1, 0, { role: 'user', parts: [{ text: `${projectContextPreamble}\n\n${projectFileContext}`}] });
            }

            const systemInstruction = MODES['simple-coder'].systemInstruction!;

            const response = await generateContentWithRetries(apiKey, activeModel, historyForApiWithContext, systemInstruction, undefined, cancellationRef, () => {}, cancellableSleep);
            if (cancellationRef.current) throw new Error('Cancelled by user');

            const { summary: summaryText, functionCalls } = parseHybridResponse(response.text);

            if (!summaryText && functionCalls.length === 0) {
                setChatHistory(prev => prev.slice(0, -1));
            } else {
                 const modelTurnParts: ChatPart[] = [];
                if (summaryText) modelTurnParts.push({ text: summaryText });
                functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));

                const modelTurnWithMessage: ChatMessage = { role: 'model', parts: modelTurnParts, mode: selectedMode };

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

            const projectFileContext = getProjectContextStringLocal();
            if (projectFileContext) {
                 historyForApiWithContext.splice(historyForApiWithContext.length - 1, 0, { role: 'user', parts: [{ text: `${projectContextPreambleForDefault}\n\n${projectFileContext}`}] });
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
                    const modelTurnWithMessage: ChatMessage = { role: 'model', parts: [{ text: modelResponseText }], mode: selectedMode };
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
          const errorMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessageText}` }], mode: selectedMode };
          setChatHistory(prev => {
              const newHistory = [...prev];
              // Replace the placeholder message with the error.
              if (newHistory[newHistory.length - 1]?.role === 'model') {
                  newHistory[newHistory.length - 1] = errorMessage;
              } else {
                  newHistory.push(errorMessage);
              }
              return newHistory;
          });
      } else {
           // If cancelled, remove the empty model message placeholder
          setChatHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'model' && last.parts.every(p => ('text' in p) && !p.text)) {
                  return prev.slice(0, -1);
              }
              return prev;
          });
      }
    } finally {
      setIsChatProcessing(false);
      cancellationRef.current = false;
    }
  }, [
    apiKey, chatHistory, selectedModel, selectedMode, isStreamingEnabled,
    setIsSettingsModalOpen, getSerializableContext, applyFunctionCalls, attachedFiles,
    clearProjectContext, setCreatingInFs, prompt, showToast
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
    advancedCoderState,
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
