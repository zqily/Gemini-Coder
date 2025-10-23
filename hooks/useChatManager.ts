import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, AttachedFile, ModeId, ChatPart, ProjectContext } from '../types';
import { generateContentWithRetries } from '../services/geminiService';
import { MODES, FILE_SYSTEM_TOOLS } from '../config/modes';
import type { FunctionCall } from '@google/genai';

interface UseChatManagerProps {
  apiKey: string;
  selectedModel: string;
  selectedMode: ModeId;
  projectContext: ProjectContext | null;
  getSerializableContext: () => string | null;
  applyFunctionCalls: (calls: FunctionCall[]) => any[];
}

export const useChatManager = ({
  apiKey,
  selectedModel,
  selectedMode,
  projectContext,
  getSerializableContext,
  applyFunctionCalls,
}: UseChatManagerProps) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const cancellationRef = useRef(false);

  const stopGeneration = useCallback(() => {
    cancellationRef.current = true;
  }, []);
  
  const clearChat = useCallback(() => {
    setChatHistory([]);
    setAttachedFiles([]);
  }, []);

  const submitPrompt = useCallback(async (prompt: string) => {
    if (!apiKey) {
      throw new Error('API_KEY_MISSING');
    }
    if (!prompt.trim() && attachedFiles.length === 0) return;

    setIsLoading(true);
    cancellationRef.current = false;

    const userParts: ChatPart[] = [];
    if (prompt) userParts.push({ text: prompt });
    attachedFiles.forEach(file => {
      userParts.push({
        inlineData: {
          mimeType: file.type,
          data: file.content.split(',')[1]
        }
      });
    });

    const newUserMessage: ChatMessage = { role: 'user', parts: userParts };
    const updatedChatHistory = [...chatHistory, newUserMessage];
    setChatHistory(updatedChatHistory);
    setAttachedFiles([]);
    
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
    
    setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

    try {
        const cleanHistory = (history: ChatMessage[]): ChatMessage[] => {
            return history.map(message => {
                if (message.role === 'model') {
                    const newParts = message.parts
                        .map(part => {
                            if ('text' in part && part.text) {
                                let textToClean = part.text;
                                const startTag = '<think>';
                                const endTag = '</think>';
                                
                                const firstStartTagIndex = textToClean.indexOf(startTag);
                                const lastEndTagIndex = textToClean.lastIndexOf(endTag);
                                
                                let cleanedText = textToClean;

                                if (firstStartTagIndex !== -1 && lastEndTagIndex !== -1 && firstStartTagIndex < lastEndTagIndex) {
                                    cleanedText = textToClean.substring(lastEndTagIndex + endTag.length).trim();
                                }
                                
                                return { ...part, text: cleanedText };
                            }
                            return part;
                        })
                        .filter(part => {
                            if ('text' in part) return !!part.text;
                            return true;
                        });

                    return { ...message, parts: newParts };
                }
                return message;
            }).filter(message => message.parts.length > 0);
        };

        let historyForApi = cleanHistory(updatedChatHistory);
        const isCoderMode = selectedMode.includes('coder');
        const isProjectSynced = projectContext !== null;
        
        if (isProjectSynced && isCoderMode) {
             const fileContext = getSerializableContext();
             if (fileContext) {
                 const contextMessage: ChatMessage = {
                     role: 'user',
                     parts: [{ text: `The user has provided this project context. Use your tools to operate on it. Do not output this context in your response.\n\n${fileContext}`}]
                 };
                 historyForApi.splice(historyForApi.length - 1, 0, contextMessage);
             }
        }
        
        if (isCoderMode) {
            const thinkPrimerMessage: ChatMessage = {
                role: 'model',
                parts: [{ text: "Alright, before providing the final response, I will think step-by-step through the reasoning process and put it inside a <think> block using this format:\n\n```jsx\n<think>\nHuman request: (My interpretation of Human's request)\nHigh-level Plan: (A high level plan of what I'm going to do)\nDetailed Plan: (A more detailed plan that expands on the above plan)\n</think>\n```" }]
            };
            historyForApi.push(thinkPrimerMessage);
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
        
        const mode = MODES[selectedMode];
        let systemInstruction = mode.systemInstruction;
        if (isCoderMode && !isProjectSynced) {
            systemInstruction = (mode as any).systemInstructionNoProject;
        }

        const tools = isCoderMode && isProjectSynced ? [{ functionDeclarations: FILE_SYSTEM_TOOLS }] : undefined;

        const response = await generateContentWithRetries(
            apiKey, selectedModel, historyForApi, systemInstruction, tools,
            cancellationRef, onStatusUpdate, cancellableSleep
        );

        if (cancellationRef.current) throw new Error('Cancelled by user');

        const modelResponseText = response.text;
        const functionCalls = (response.functionCalls ?? []) as FunctionCall[];

        if (!modelResponseText && functionCalls.length === 0) {
            setChatHistory(prev => prev.slice(0, -1));
        } else {
            const modelTurnParts: ChatPart[] = [];
            if (modelResponseText) modelTurnParts.push({ text: modelResponseText });
            functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));
    
            const modelTurnWithMessage: ChatMessage = { role: 'model', parts: modelTurnParts };

            setChatHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = modelTurnWithMessage;
                return newHistory;
            });

            if (functionCalls.length > 0) {
                if (cancellationRef.current) throw new Error('Cancelled by user');
                
                const functionResponses = applyFunctionCalls(functionCalls);
                
                if (cancellationRef.current) throw new Error('Cancelled by user');
                
                const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                setChatHistory(prev => [...prev, toolResponseMessage]);
            }
        }
    } catch (error) {
      console.error("A critical error occurred during prompt submission:", error);
      const errorMessageText = error instanceof Error ? error.message : 'An unknown error occurred';
      
      if (errorMessageText !== 'Cancelled by user') {
          const errorMessage: ChatMessage = {
            role: 'model',
            parts: [{ text: `Error: ${errorMessageText}` }]
          };
          setChatHistory(prev => {
              const newHistory = [...prev];
              newHistory[newHistory.length - 1] = errorMessage;
              return newHistory;
          });
      } else {
          setChatHistory(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      cancellationRef.current = false;
    }
  }, [
    apiKey,
    attachedFiles,
    chatHistory,
    selectedModel,
    selectedMode,
    projectContext,
    getSerializableContext,
    applyFunctionCalls,
  ]);

  return {
    chatHistory,
    isLoading,
    isReadingFiles,
    attachedFiles,
    setAttachedFiles,
    setIsReadingFiles,
    stopGeneration,
    submitPrompt,
    clearChat,
  };
};