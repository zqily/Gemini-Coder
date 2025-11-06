import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { ChatContext, ChatContextType } from './ChatContext';
import { useSelectedModel } from './useSelectedModel';
import { useSelectedMode } from './useSelectedMode';
import { generateContentWithRetries, generateContentStreamWithRetries } from './services/geminiService';
import { executeManagedBatchCall } from './services/rateLimitManager';
import type { ChatMessage, AttachedFile, ChatPart, TextPart, AdvancedCoderState, GroundingChunk, IndicatorState, AdvancedCoderRunContext, ModeId, AdvancedCoderPhase } from '../../types';
import { MODES, FILE_SYSTEM_COMMAND_INSTRUCTIONS } from './config/modes';
import { SIMPLE_CODER_PERSONAS } from './config/personas';
import { useSettings } from '../settings/SettingsContext';
import { FunctionCall, GenerateContentResponse } from '@google/genai';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from './utils/fileUpload';
import { useFileSystem } from '../file-system/FileSystemContext';
import { countTotalTokens } from './utils/tokenCounter';
import { useToast } from '../toast/ToastContext';


interface ChatProviderProps {
  children: ReactNode;
}

/**
 * Parses the model's text response to extract a summary and file system commands from an XML block.
 * This function uses a strict validation approach. If the XML is malformed or doesn't adhere
 * to the schema, the entire response is treated as a summary, and no function calls are produced.
 * @param responseText The raw text from the model.
 * @returns An object with the user-facing summary and an array of FunctionCall objects.
 */
const parseXmlResponse = (responseText: string): { summary: string; functionCalls: FunctionCall[] } => {
    if (!responseText) {
        return { summary: '', functionCalls: [] };
    }

    const changesBlockRegex = /<changes>[\s\S]*?<\/changes>/;
    const match = responseText.match(changesBlockRegex);

    if (!match) {
        // No <changes> block found, treat the whole response as a summary.
        return { summary: responseText, functionCalls: [] };
    }

    const xmlString = match[0];
    const summary = responseText.substring(0, match.index).trim();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        console.error('XML parsing error:', parserError.textContent);
        // Fallback: treat the whole response as a summary if XML is malformed.
        return { summary: responseText, functionCalls: [] };
    }

    const changeNodes = doc.querySelectorAll('changes > change');
    const functionCalls: FunctionCall[] = [];

    // --- Validation Phase ---
    // Iterate through all change nodes first to validate them.
    // If any node is invalid, we abort and return the whole response as text.
    for (const changeNode of Array.from(changeNodes)) {
        const functionNameElement = changeNode.querySelector('function');
        const functionName = functionNameElement?.textContent?.trim();

        if (!functionName) {
            console.error('Validation Error: Missing <function> tag in a <change> block.');
            return { summary: responseText, functionCalls: [] };
        }

        switch (functionName) {
            case 'writeFile': {
                const path = changeNode.querySelector('path')?.textContent;
                const content = changeNode.querySelector('content')?.textContent; // CDATA is parsed as text content
                if (!path || content === null || content === undefined) {
                    console.error('Validation Error: writeFile requires <path> and <content> tags.');
                    return { summary: responseText, functionCalls: [] };
                }
                break;
            }
            case 'createFolder': {
                const path = changeNode.querySelector('path')?.textContent;
                if (!path) {
                    console.error('Validation Error: createFolder requires a <path> tag.');
                    return { summary: responseText, functionCalls: [] };
                }
                break;
            }
            case 'deletePath': {
                const path = changeNode.querySelector('path')?.textContent;
                if (!path) {
                    console.error('Validation Error: deletePath requires a <path> tag.');
                    return { summary: responseText, functionCalls: [] };
                }
                break;
            }
            case 'move': {
                const source = changeNode.querySelector('source')?.textContent;
                const destination = changeNode.querySelector('destination')?.textContent;
                if (!source || !destination) {
                    console.error('Validation Error: move requires <source> and <destination> tags.');
                    return { summary: responseText, functionCalls: [] };
                }
                break;
            }
            default:
                console.error(`Validation Error: Unknown function name "${functionName}".`);
                return { summary: responseText, functionCalls: [] };
        }
    }

    // --- Generation Phase ---
    // If validation passed, now we can safely generate the function calls.
    for (const changeNode of Array.from(changeNodes)) {
        const functionName = changeNode.querySelector('function')!.textContent!.trim();
        
        switch (functionName) {
            case 'writeFile': {
                const path = changeNode.querySelector('path')!.textContent!;
                const content = changeNode.querySelector('content')!.textContent!;
                functionCalls.push({ name: 'writeFile', args: { path: path.trim(), content } });
                break;
            }
            case 'createFolder': {
                const path = changeNode.querySelector('path')!.textContent!;
                functionCalls.push({ name: 'createFolder', args: { path: path.trim() } });
                break;
            }
            case 'deletePath': {
                const path = changeNode.querySelector('path')!.textContent!;
                functionCalls.push({ name: 'deletePath', args: { path: path.trim() } });
                break;
            }
            case 'move': {
                const source = changeNode.querySelector('source')!.textContent!;
                const destination = changeNode.querySelector('destination')!.textContent!;
                functionCalls.push({ name: 'move', args: { sourcePath: source.trim(), destinationPath: destination.trim() } });
                break;
            }
        }
    }
    
    // Check if there is any text content after the xml block.
    const trailingSummary = responseText.substring(match.index + xmlString.length).trim();
    const finalSummary = (summary + '\n' + trailingSummary).trim();
    
    return { summary: finalSummary, functionCalls };
};

const updatePhase = (prevState: AdvancedCoderState | null, phaseId: string, updates: object): AdvancedCoderState | null => {
    if (!prevState) return null;
    const newPhases = prevState.phases.map(p => p.id === phaseId ? { ...p, ...updates } : p);
    return { ...prevState, phases: newPhases };
};

const generateAdvancedCoderPhases = (count: 3 | 6 | 9 | 12): AdvancedCoderPhase[] => {
    const phases: AdvancedCoderPhase[] = [
        // Titles are updated at the end.
        { id: 'planning', title: 'Phase X: Planning', status: 'pending', subtasks: [] },
        { id: 'consolidation', title: 'Phase X: Consolidation', status: 'pending' },
    ];
    
    const numCycles = Math.floor((count - 2) / 3);

    for (let i = 1; i <= numCycles; i++) {
        const cycleTitleSuffix = numCycles > 1 ? ` (Cycle ${i}/${numCycles})` : '';
        phases.push({ id: `drafting-${i}`, title: `Phase X: Drafting${cycleTitleSuffix}`, status: 'pending' });
        phases.push({ id: `debugging-${i}`, title: `Phase X: Debugging${cycleTitleSuffix}`, status: 'pending', subtasks: [] });
        phases.push({ id: `review-${i}`, title: `Phase X: Review Consolidation${cycleTitleSuffix}`, status: 'pending' });
    }

    phases.push({ id: 'final', title: `Phase X: Final Implementation`, status: 'pending' });

    // Update titles with correct phase numbers
    return phases.map((phase, index) => ({
        ...phase,
        title: phase.title.replace('Phase X', `Phase ${index + 1}/${phases.length}`),
    }));
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
  const [indicatorState, setIndicatorState] = useState<IndicatorState>('loading');
  
  // State for the new mode settings modal
  const [isModeSettingsModalOpen, setIsModeSettingsModalOpen] = useState(false);
  const [modeSettingsModalConfig, setModeSettingsModalConfig] = useState<{ modeId: ModeId } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileAttachInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [selectedMode, setSelectedMode] = useSelectedMode();

  const { apiKey, isStreamingEnabled, isGoogleSearchEnabled, isContextTokenUnlocked, setIsSettingsModalOpen, simpleCoderSettings, advancedCoderSettings } = useSettings();
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
  
  // This effect attaches the live Advanced Coder progress to the placeholder model message.
  useEffect(() => {
    if (isChatProcessing && selectedMode === 'advanced-coder' && advancedCoderState) {
      setChatHistory(prev => {
        if (prev.length === 0) return prev;
        const lastMessage = prev[prev.length - 1];
        // Only update if it's the model placeholder for advanced coder.
        if (lastMessage?.role === 'model' && lastMessage.mode === 'advanced-coder') {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = {
            ...lastMessage,
            advancedCoderState: advancedCoderState,
          };
          return newHistory;
        }
        return prev;
      });
    }
  }, [advancedCoderState, isChatProcessing, selectedMode]);

  // Token Calculation Effect
  useEffect(() => {
    const calculateTokens = async () => {
        const projectContextString = getSerializableContext();

        if ((!prompt.trim() && attachedFiles.length === 0 && chatHistory.length === 0 && !projectContextString) || !apiKey) {
            setTotalTokens(0);
            return;
        }

        const projectContextPreamble = `The user has provided a project context. This includes a list of all folders, and a list of all files with their full paths and content. All paths are relative to the project root. Use this information to understand the project structure and answer the user's request. When performing file operations, you MUST use the exact paths provided.`;
        const projectContextPreambleForDefault = `The user has provided a project context. This includes a list of all folders, and a list of all files with their full paths and content. All paths are relative to the project root. Use this information to understand the project structure and answer the user's request. Do not mention this context message in your response unless the user asks about it.`;
        
        const preamble = selectedMode === 'default' ? projectContextPreambleForDefault : projectContextPreamble;

        let activeModel = selectedModel;
        if (selectedMode === 'advanced-coder') {
            activeModel = 'gemini-2.5-pro';
        }
        if (!activeModel) {
            setTotalTokens(0);
            return;
        }

        const tokens = await countTotalTokens(
            apiKey,
            activeModel,
            chatHistory,
            prompt,
            attachedFiles,
            projectContextString,
            preamble
        );

        if (tokens === -1) {
            showToast("Invalid API Key. Token counting failed.", "error");
            setTotalTokens(0);
        } else {
            setTotalTokens(tokens);
        }
    };

    // Debounce the calculation
    const handler = setTimeout(() => {
      calculateTokens();
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [prompt, chatHistory, attachedFiles, getSerializableContext, apiKey, selectedModel, selectedMode, showToast]);

  const onStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsChatProcessing(false);
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
      // FIX: Explicitly type `files` to ensure `file` in the loop is a `File` object.
      const files: File[] = Array.from(event.target.files);
      
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
    
  const runFinalImplementationPhase = useCallback(async (
    context: AdvancedCoderRunContext,
    controller: AbortController,
    isFirstRun: boolean
  ) => {
      const { baseHistory, codeDraft, consolidatedReview } = context;
      const onStatusUpdateForRetries = (message: string) => {
          setAdvancedCoderState(prev => (prev ? { ...prev, statusMessage: message } : null));
      };
      
      const allPhases = advancedCoderSettings.phaseCount;
      const initialPhases = generateAdvancedCoderPhases(allPhases);

      if (isFirstRun) {
          setAdvancedCoderState(prev => updatePhase(prev, 'final', { status: 'running' }));
      } else {
          // Rebuild a completed-looking state for retry
          const retryState: AdvancedCoderState = {
              phases: initialPhases.map(p => ({
                  ...p,
                  status: p.id === 'final' ? 'running' : 'completed',
              })),
              statusMessage: 'Retrying final phase...',
          };
          setAdvancedCoderState(retryState);
      }

      const finalSystemInstruction = MODES['advanced-coder'].phases!.final;

      const finalHistory = [...baseHistory];
      const finalUserContent = `Here is the context for the final implementation. Generate the file system operations.\n\nCode Draft:\n${codeDraft}\n\n${consolidatedReview ? `Consolidated Review:\n${consolidatedReview}` : 'No issues were found in the draft.'}`;
      finalHistory.push({ role: 'user', parts: [{ text: finalUserContent }] });
      
      const finalInputTokens = 0; // TODO: Replace
      const finalApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', finalHistory, finalSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)];
      const response = (await executeManagedBatchCall('gemini-2.5-pro', finalInputTokens, controller.signal, finalApiCall, onStatusUpdateForRetries, isContextTokenUnlocked))[0];
      
      if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
      if (response instanceof Error) throw response;
      
      let finalState: AdvancedCoderState | null = null;
      setAdvancedCoderState(prev => {
          finalState = updatePhase(prev, 'final', { status: 'completed', output: response.text });
          return finalState;
      });
      
      const { summary: summaryText, functionCalls } = parseXmlResponse(response.text);

      if (!summaryText && functionCalls.length === 0) {
          setChatHistory(prev => prev.slice(0, -1));
      } else {
          const modelTurnParts: ChatPart[] = [];
          if (summaryText) modelTurnParts.push({ text: summaryText });
          functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));

          const modelTurnWithMessage: ChatMessage = {
              role: 'model',
              parts: modelTurnParts,
              mode: selectedMode,
              advancedCoderContext: context,
              advancedCoderState: finalState,
          };

          setChatHistory(prev => {
              const newHistory = [...prev];
              newHistory[newHistory.length - 1] = modelTurnWithMessage;
              return newHistory;
          });

          if (functionCalls.length > 0) {
              if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
              const functionResponses: ChatPart[] = await applyFunctionCalls(functionCalls);

              if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');

              const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
              setChatHistory(prev => [...prev, toolResponseMessage]);
          }
      }
  }, [apiKey, applyFunctionCalls, isContextTokenUnlocked, selectedMode, advancedCoderSettings.phaseCount]);

  const onSubmit = useCallback(async (currentPrompt: string) => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
        
        const modelPlaceholder: ChatMessage = { role: 'model', parts: [{ text: '' }], mode: selectedMode };
        setChatHistory(prev => [...prev, newUserMessage, modelPlaceholder]);

        setAttachedFiles([]);
        setPrompt('');
    } else {
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage?.role === 'user') {
            historyForApi = [...chatHistory];
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }], mode: selectedMode }]);
        } else {
            return;
        }
    }

    setIsChatProcessing(true);
    setIndicatorState('loading');
    
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
            
            const { phaseCount } = advancedCoderSettings;
            const initialPhases = generateAdvancedCoderPhases(phaseCount);
            setAdvancedCoderState({ phases: initialPhases, statusMessage: '' });
            
            try {
                let baseHistory = [...historyForApi];
                const projectFileContext = getProjectContextStringLocal();
                if (projectFileContext) {
                    baseHistory.splice(baseHistory.length - 1, 0, { role: 'user', parts: [{ text: `${projectContextPreamble}\n\n${projectFileContext}` }] });
                }
                
                const advancedCoderMode = MODES['advanced-coder'];

                // Phase 1: Planning
                setAdvancedCoderState(prev => updatePhase(prev, 'planning', { status: 'running' }));
                const plannerSystemInstruction = advancedCoderMode.phases!.planning;
                const planningHistoryForTokens = [...baseHistory];
                const plannerInputTokens = 0; // TODO: Replace
                
                const planningApiCalls = Array(3).fill(0).map(() =>
                    () => generateContentWithRetries(apiKey, 'gemini-flash-latest', planningHistoryForTokens, plannerSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)
                );

                const planningResults = await executeManagedBatchCall('gemini-flash-latest', plannerInputTokens, controller.signal, planningApiCalls, onStatusUpdateForRetries, isContextTokenUnlocked);
                if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');

                const successfulPlans = planningResults
                    .map((res, i) => ({
                        title: `Planner ${i+1} Output`,
                        content: (res instanceof Error || !res.text) ? `Error: ${res instanceof Error ? res.message : 'No output'}` : res.text
                    }));

                setAdvancedCoderState(prev => updatePhase(prev, 'planning', { status: 'completed', subtasks: successfulPlans }));
                if (planningResults.every(res => res instanceof Error)) throw new Error("All planning instances failed.");

                // Phase 2: Consolidation
                setAdvancedCoderState(prev => updatePhase(prev, 'consolidation', { status: 'running' }));
                const consolidationSystemInstruction = advancedCoderMode.phases!.consolidation;
                const consolidationHistory = [...baseHistory];
                const successfulPlanContents = successfulPlans.filter(p => !p.content.startsWith('Error:')).map(p => p.content);
                consolidationHistory.push({ role: 'user', parts: [{ text: `Here are the plans from the architects:\n\n${successfulPlanContents.map((p, i) => `--- PLAN ${i+1} ---\n${p}`).join('\n\n')}` }] });

                const consolidationInputTokens = 0; // TODO: Replace
                const consolidationApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', consolidationHistory, consolidationSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)];
                
                const consolidationResult = (await executeManagedBatchCall('gemini-2.5-pro', consolidationInputTokens, controller.signal, consolidationApiCall, onStatusUpdateForRetries, isContextTokenUnlocked))[0];
                if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                if (consolidationResult instanceof Error) throw consolidationResult;
                const masterPlan = consolidationResult.text;
                setAdvancedCoderState(prev => updatePhase(prev, 'consolidation', { status: 'completed', output: masterPlan }));
                
                let currentCodeDraft = masterPlan; // Initial draft is the plan
                let currentConsolidatedReview = '';
                let earlyExit = false;
                const numCycles = Math.floor((phaseCount - 2) / 3);
                
                // Iterative Drafting/Debugging/Review Cycles
                for (let cycle = 1; cycle <= numCycles; cycle++) {
                    // Phase 3: Drafting
                    setAdvancedCoderState(prev => updatePhase(prev, `drafting-${cycle}`, { status: 'running' }));
                    const draftingSystemInstruction = advancedCoderMode.phases!.drafting;
                    const draftingHistory = [...baseHistory];
                    const draftingUserMessage = cycle === 1
                        ? `Here is the master plan. Please generate the code draft.\n\n${currentCodeDraft}`
                        : `Here is the previous code draft and the consolidated review. Please generate an improved code draft.\n\nCode Draft:\n${currentCodeDraft}\n\nReview:\n${currentConsolidatedReview}`;
                    draftingHistory.push({ role: 'user', parts: [{ text: draftingUserMessage }] });

                    const draftingInputTokens = 0; // TODO: Replace
                    const draftingApiCall = [() => generateContentWithRetries(apiKey, 'gemini-2.5-pro', draftingHistory, draftingSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)];
                    const draftingResult = (await executeManagedBatchCall('gemini-2.5-pro', draftingInputTokens, controller.signal, draftingApiCall, onStatusUpdateForRetries, isContextTokenUnlocked))[0];
                    if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                    if (draftingResult instanceof Error) throw draftingResult;
                    currentCodeDraft = draftingResult.text;
                    setAdvancedCoderState(prev => updatePhase(prev, `drafting-${cycle}`, { status: 'completed', output: currentCodeDraft }));

                    // Phase 4: Debugging
                    setAdvancedCoderState(prev => updatePhase(prev, `debugging-${cycle}`, { status: 'running' }));
                    const debuggerSystemInstruction = advancedCoderMode.phases!.debugging;
                    const debuggingHistory = [...baseHistory];
                    debuggingHistory.push({ role: 'user', parts: [{ text: `Master Plan:\n${masterPlan}\n\nCode Draft:\n${currentCodeDraft}` }] });

                    const debuggingInputTokens = 0; // TODO: Replace
                    const debuggingApiCalls = Array(3).fill(0).map(() =>
                        () => generateContentWithRetries(apiKey, 'gemini-flash-latest', debuggingHistory, debuggerSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)
                    );
                    const debuggingResults = await executeManagedBatchCall('gemini-flash-latest', debuggingInputTokens, controller.signal, debuggingApiCalls, onStatusUpdateForRetries, isContextTokenUnlocked);
                    if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                    
                    const debuggingReports: string[] = [];
                    let noProblemCount = 0;
                    const debuggerSubtasks = debuggingResults.map((res, i) => {
                        if (res instanceof Error) return { title: `Debugger ${i+1} Output`, content: `Error: ${res.message}` };
                        
                        const hasNoProblemText = res.text?.trim().endsWith('NO PROBLEMS DETECTED');

                        if (hasNoProblemText) {
                            noProblemCount++;
                            return { title: `Debugger ${i+1} Output`, content: 'No problems detected.' };
                        }

                        const reportText = res.text;
                        if (reportText) debuggingReports.push(reportText);
                        return { title: `Debugger ${i+1} Output`, content: reportText || 'No feedback provided.' };
                    });
                    setAdvancedCoderState(prev => updatePhase(prev, `debugging-${cycle}`, { status: 'completed', subtasks: debuggerSubtasks }));

                    if (noProblemCount === 3) {
                        earlyExit = true;
                        setAdvancedCoderState(prev => updatePhase(prev, `review-${cycle}`, { status: 'skipped' }));
                        break;
                    }

                    // Phase 5: Review Consolidation
                    if (debuggingReports.length > 0) {
                        setAdvancedCoderState(prev => updatePhase(prev, `review-${cycle}`, { status: 'running' }));
                        const reviewConsolidationSystemInstruction = advancedCoderMode.phases!.review;
                        const reviewHistory = [...baseHistory];
                        reviewHistory.push({ role: 'user', parts: [{ text: `Code Draft:\n${currentCodeDraft}\n\nDebugging Reports:\n${debuggingReports.join('\n---\n')}` }] });

                        const reviewInputTokens = 0; // TODO: Replace
                        const reviewApiCall = [() => generateContentWithRetries(apiKey, 'gemini-flash-latest', reviewHistory, reviewConsolidationSystemInstruction, undefined, controller.signal, onStatusUpdateForRetries, setIndicatorState)];
                        const reviewResult = (await executeManagedBatchCall('gemini-flash-latest', reviewInputTokens, controller.signal, reviewApiCall, onStatusUpdateForRetries, isContextTokenUnlocked))[0];
                        if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                        if (reviewResult instanceof Error) throw reviewResult;
                        currentConsolidatedReview = reviewResult.text;
                        setAdvancedCoderState(prev => updatePhase(prev, `review-${cycle}`, { status: 'completed', output: currentConsolidatedReview }));
                    } else {
                         setAdvancedCoderState(prev => updatePhase(prev, `review-${cycle}`, { status: 'skipped' }));
                    }
                }

                // If we exited early, mark all subsequent cycles as skipped
                if (earlyExit) {
                    setAdvancedCoderState(prev => {
                        if (!prev) return null;
                        const newPhases = [...prev.phases];
                        let foundRunning = false;
                        for (let i = 0; i < newPhases.length; i++) {
                            if (newPhases[i].status === 'running' || newPhases[i].status === 'pending') {
                                if (foundRunning) { // Mark subsequent pending phases as skipped
                                    if(newPhases[i].id.startsWith('drafting') || newPhases[i].id.startsWith('debugging') || newPhases[i].id.startsWith('review')) {
                                      newPhases[i] = { ...newPhases[i], status: 'skipped' };
                                    }
                                }
                                if (newPhases[i].status === 'running') foundRunning = true;
                            }
                        }
                        return { ...prev, phases: newPhases };
                    });
                }


                // Phase 6: Final Implementation
                const advancedCoderContextForRetry: AdvancedCoderRunContext = {
                    baseHistory,
                    codeDraft: currentCodeDraft,
                    consolidatedReview: currentConsolidatedReview,
                };
                
                await runFinalImplementationPhase(advancedCoderContextForRetry, controller, true);

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
            
            const personaKey = simpleCoderSettings.persona;
            const personaInstruction = personaKey === 'custom'
                ? simpleCoderSettings.customInstruction
                : SIMPLE_CODER_PERSONAS[personaKey]?.instruction || SIMPLE_CODER_PERSONAS['default'].instruction;

            const systemInstruction = `${personaInstruction}\n\n${FILE_SYSTEM_COMMAND_INSTRUCTIONS}`;

            const response = await generateContentWithRetries(apiKey, activeModel, historyForApiWithContext, systemInstruction, undefined, controller.signal, () => {}, setIndicatorState);
            if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');

            const { summary: summaryText, functionCalls } = parseXmlResponse(response.text);

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
                    if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                    const functionResponses: ChatPart[] = await applyFunctionCalls(functionCalls);

                    if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');

                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                }
            }

        } else {
            let historyForApiWithContext = [...historyForApi];
            const shouldUseStreaming = isStreamingEnabled && selectedMode === 'default' && !isGoogleSearchEnabled;
            
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
                const stream = generateContentStreamWithRetries( apiKey, activeModel, historyForApiWithContext, systemInstruction, controller.signal, onStatusUpdate, setIndicatorState );
                let fullResponseText = '';
                for await (const chunk of stream) {
                    if (controller.signal.aborted) break;
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
                if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                if (!fullResponseText.trim()) setChatHistory(prev => prev.slice(0, -1));
            } else {
                const toolsForApi = isGoogleSearchEnabled ? [{ googleSearch: {} }] : undefined;
                const response = await generateContentWithRetries( apiKey, activeModel, historyForApiWithContext, systemInstruction, toolsForApi, controller.signal, onStatusUpdate, setIndicatorState );
                if (controller.signal.aborted) throw new DOMException('Cancelled by user', 'AbortError');
                const modelResponseText = response.text;
                const groundingChunks: GroundingChunk[] | undefined = response.candidates?.[0]?.groundingMetadata?.groundingChunks;


                if (!modelResponseText.trim()) {
                    setChatHistory(prev => prev.slice(0, -1));
                } else {
                    const modelTurnWithMessage: ChatMessage = { 
                        role: 'model', 
                        parts: [{ text: modelResponseText }], 
                        mode: selectedMode,
                        groundingChunks: groundingChunks
                    };
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
      const isAbortError = error instanceof DOMException && error.name === 'AbortError';

      if (!isAbortError) {
          const errorMessageText = error instanceof Error ? error.message : 'An unknown error occurred';
          const errorMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessageText}` }], mode: selectedMode };
          setChatHistory(prev => {
              const newHistory = [...prev];
              if (newHistory[newHistory.length - 1]?.role === 'model') {
                  newHistory[newHistory.length - 1] = errorMessage;
              } else {
                  newHistory.push(errorMessage);
              }
              return newHistory;
          });
      } else {
          setChatHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'model' && last.parts.every(p => ('text' in p) && !p.text)) {
                  return prev.slice(0, -1);
              }
              return prev;
          });
      }
    } finally {
      if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
      }
      if (!controller.signal.aborted) {
          setIsChatProcessing(false);
      }
      setIndicatorState('loading');
    }
  }, [
    apiKey, chatHistory, selectedModel, selectedMode, isStreamingEnabled, isGoogleSearchEnabled, isContextTokenUnlocked,
    setIsSettingsModalOpen, getSerializableContext, applyFunctionCalls, attachedFiles,
    clearProjectContext, setCreatingInFs, prompt, showToast, runFinalImplementationPhase,
    simpleCoderSettings, advancedCoderSettings
  ]);

  const onRetryLastAdvancedCoderPhase = useCallback(async () => {
    // FIX: Replace findLastIndex with a manual loop for broader JS compatibility.
    let lastModelMessageIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'model') {
            lastModelMessageIndex = i;
            break;
        }
    }
    if (lastModelMessageIndex === -1) return;

    const lastModelMessage = chatHistory[lastModelMessageIndex];
    if (!lastModelMessage || !lastModelMessage.advancedCoderContext) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Remove the last model message. A tool response won't exist because the button only shows if there are no function calls.
    setChatHistory(prev => prev.slice(0, lastModelMessageIndex));
    setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }], mode: 'advanced-coder' }]);
    
    setIsChatProcessing(true);
    setIndicatorState('loading');

    try {
        await runFinalImplementationPhase(lastModelMessage.advancedCoderContext, controller, false);
    } catch (error) {
        console.error("A critical error occurred during retry:", error);
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        if (!isAbortError) {
            const errorMessageText = error instanceof Error ? error.message : 'An unknown error occurred';
            const errorMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessageText}` }], mode: selectedMode };
            setChatHistory(prev => {
                const newHistory = [...prev];
                if (newHistory[newHistory.length - 1]?.role === 'model') {
                    newHistory[newHistory.length - 1] = errorMessage;
                } else {
                    newHistory.push(errorMessage);
                }
                return newHistory;
            });
        }
    } finally {
        if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
            setIsChatProcessing(false);
        }
        setIndicatorState('loading');
    }
}, [chatHistory, runFinalImplementationPhase, selectedMode]);

  const openModeSettingsModal = useCallback((modeId: ModeId) => {
    setModeSettingsModalConfig({ modeId });
    setIsModeSettingsModalOpen(true);
  }, []);
  
  const closeModeSettingsModal = useCallback(() => {
    setIsModeSettingsModalOpen(false);
    setModeSettingsModalConfig(null);
  }, []);

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
    indicatorState,
    isModeSettingsModalOpen,
    modeSettingsModalConfig,
    openModeSettingsModal,
    closeModeSettingsModal,
    setAttachedFiles,
    setSelectedModel,
    onSubmit,
    onStop,
    onNewChat,
    setSelectedMode,
    onDeleteMessage,
    onFileAddClick,
    onRetryLastAdvancedCoderPhase,
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