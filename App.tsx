import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import FileEditorModal from './components/FileEditorModal';
import type { ChatMessage, AttachedFile, ModeId, ProjectContext, ChatPart } from './types';
import { generateContentWithRetries, generateContentStreamWithRetries } from './services/geminiService';
import { useApiKey } from './hooks/useApiKey';
import { useSelectedModel } from './hooks/useSelectedModel';
import { useSendShortcutSetting } from './hooks/useSendShortcutSetting';
import { useSelectedMode } from './hooks/useSelectedMode';
import { useStreamingSetting } from './hooks/useStreamingSetting';
import { createIsIgnored } from './utils/gitignore';
import * as FileSystem from './utils/fileSystem';
import { executeFunctionCall } from './utils/functionCalling';
import { MODES, FILE_SYSTEM_TOOLS } from './config/modes';
import { Type, FunctionCall } from '@google/genai';

// Custom hook to detect window size
const useWindowSize = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

const EMPTY_CONTEXT: ProjectContext = { files: new Map(), dirs: new Set() };


const App: React.FC = () => {
  const isMobile = useWindowSize();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [apiKey, setApiKey] = useApiKey();
  const [sendWithCtrlEnter, setSendWithCtrlEnter] = useSendShortcutSetting();
  const [isStreamingEnabled, setIsStreamingEnabled] = useStreamingSetting();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useSelectedMode();

  // File system state
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [originalProjectContext, setOriginalProjectContext] = useState<ProjectContext | null>(null);
  const [deletedItems, setDeletedItems] = useState<ProjectContext>(EMPTY_CONTEXT);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  
  const [displayContext, setDisplayContext] = useState<ProjectContext | null>(null);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const cancellationRef = useRef(false);
  
  useEffect(() => {
    if (!apiKey) {
      setIsSettingsModalOpen(true);
    }
  }, [apiKey]);
  
  useEffect(() => {
    // This context is for rendering the file tree. It shows everything: current + deleted + attached.
    const mergedFiles = new Map([
      ...(deletedItems?.files || []),
      ...(projectContext?.files || [])
    ]);
    const mergedDirs = new Set([
        ...(deletedItems?.dirs || []),
        ...(projectContext?.dirs || [])
    ]);

    const newContext: ProjectContext = {
        files: mergedFiles,
        dirs: mergedDirs
    };

    attachedFiles.forEach(file => {
        // Simple check for text-based mime types
        const isText = file.type.startsWith('text/') || 
                       ['json', 'xml', 'javascript', 'typescript', 'csv', 'markdown', 'html', 'css'].some(t => file.type.includes(t));

        if (isText) {
             try {
                const base64Content = file.content.split(',')[1];
                if (base64Content) {
                    const textContent = atob(base64Content);
                    newContext.files.set(file.name, textContent);
                } else {
                    newContext.files.set(file.name, ''); // Handle empty file case
                }
            } catch (e) {
                console.error("Could not decode file content for sidebar display:", file.name, e);
                newContext.files.set(file.name, `[Error decoding content for ${file.name}]`);
            }
        } else {
            newContext.files.set(file.name, `[Attached file: ${file.name} (${file.type})]`);
        }
    });

    if (newContext.files.size > 0 || newContext.dirs.size > 0) {
        setDisplayContext(newContext);
    } else {
        setDisplayContext(null);
    }
  }, [projectContext, deletedItems, attachedFiles]);


  const handleNewChat = () => {
    setChatHistory([]);
    setProjectContext(null);
    setOriginalProjectContext(null);
    setDeletedItems(EMPTY_CONTEXT);
    setAttachedFiles([]);
    setExcludedPaths(new Set());
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };
  
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const handleStopGeneration = useCallback(() => {
    cancellationRef.current = true;
  }, []);

  const handleProjectSync = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList);
    let isIgnored = (path: string) => false;
    
    const gitignoreFile = files.find(f => (f as any).webkitRelativePath.endsWith('.gitignore'));
    const gcignoreFile = files.find(f => (f as any).webkitRelativePath.endsWith('.gcignore'));
    
    let combinedIgnoreContent = '';

    if (gitignoreFile) {
        const gitignoreContent = await gitignoreFile.text();
        combinedIgnoreContent += gitignoreContent + '\n';
    }

    if (gcignoreFile) {
        const gcignoreContent = await gcignoreFile.text();
        combinedIgnoreContent += gcignoreContent;
    }

    if (combinedIgnoreContent.trim()) {
      isIgnored = createIsIgnored(combinedIgnoreContent);
    }
    
    const newProjectContext: ProjectContext = { files: new Map(), dirs: new Set() };
    for (const file of files) {
        // webkitRelativePath is the property that contains the full path
        const path = (file as any).webkitRelativePath;

        // Hardcoded rule to always ignore the .git directory
        const isGitPath = /(^|\/)\.git(\/|$)/.test(path);

        if (path && !isIgnored(path) && !isGitPath) {
            try {
                const content = await file.text();
                newProjectContext.files.set(path, content);
                // Add parent directories
                const parts = path.split('/');
                let currentPath = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    // Fix: Corrected typo from 'part' to 'parts[i]' to correctly reference the current path component.
                    currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                    newProjectContext.dirs.add(currentPath);
                }
            } catch (e) {
                console.warn(`Could not read file ${path} as text. Skipping.`, e);
            }
        }
    }
    setProjectContext(newProjectContext);
    setOriginalProjectContext(newProjectContext);
    setDeletedItems(EMPTY_CONTEXT);
    setExcludedPaths(new Set());
  }, []);

  const handleUnlinkProject = useCallback(() => {
    if (window.confirm('Are you sure you want to unlink the project context?')) {
        setProjectContext(null);
        setOriginalProjectContext(null);
        setDeletedItems(EMPTY_CONTEXT);
        setExcludedPaths(new Set());
    }
  }, []);

  const handleOpenFileEditor = useCallback((path: string) => {
    const content = displayContext?.files.get(path);
    if (content !== undefined) {
        setEditingFile({ path, content });
    }
  }, [displayContext]);

  const handleSaveFile = useCallback((path: string, newContent: string) => {
    setProjectContext(prev => {
        const context = prev ?? { files: new Map(), dirs: new Set() };
        return FileSystem.createFile(path, newContent, context);
    });
    setAttachedFiles(prev => prev.filter(f => f.name !== path));
  }, []);

  const handleCloseFileEditor = () => {
    setEditingFile(null);
  };
  
  const handleTogglePathExclusion = useCallback((path: string) => {
    // Combine all known files and directories from current and deleted contexts
    const allDirs = new Set([
        ...(projectContext?.dirs || []),
        ...(deletedItems.dirs || [])
    ]);
    const allFiles = new Map([
        ...(projectContext?.files || []),
        ...(deletedItems.files || [])
    ]);

    // A path is a directory if it's explicitly in the dirs set, or if any file path starts with it as a prefix.
    const isDirectory = allDirs.has(path) || Array.from(allFiles.keys()).some(p => p.startsWith(`${path}/`));

    setExcludedPaths(prev => {
        const newSet = new Set(prev);
        
        // If it's just a file, toggle only itself.
        if (!isDirectory) {
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        }

        // It's a directory. Determine the action based on its current state.
        // If the folder is already excluded, we will include it and all its children.
        // If it's not excluded, we will exclude it and all its children.
        const shouldExclude = !newSet.has(path);

        const allPaths = new Set([
            ...allFiles.keys(),
            ...allDirs,
        ]);

        // Collect the directory itself and all its descendant paths.
        const pathsToToggle = [path, ...Array.from(allPaths).filter(p => p.startsWith(`${path}/`))];

        // Apply the action to all collected paths.
        for (const p of pathsToToggle) {
            if (shouldExclude) {
                newSet.add(p);
            } else {
                newSet.delete(p);
            }
        }
        
        return newSet;
    });
  }, [projectContext, deletedItems]);
  
  const handleDeleteMessage = useCallback((indexToDelete: number) => {
    setChatHistory(prevHistory => {
        const messageToDelete = prevHistory[indexToDelete];
        if (!messageToDelete) return prevHistory;

        const nextMessage = prevHistory[indexToDelete + 1];

        const isModelWithFunctionCall = messageToDelete.role === 'model' && messageToDelete.parts.some(p => 'functionCall' in p);
        const isNextMessageToolResponse = nextMessage?.role === 'tool';

        if (isModelWithFunctionCall && isNextMessageToolResponse) {
            // Delete both the model's message and the tool's response
            return prevHistory.filter((_, index) => index !== indexToDelete && index !== indexToDelete + 1);
        } else {
            // Delete only the selected message
            return prevHistory.filter((_, index) => index !== indexToDelete);
        }
    });
  }, []);

  const handlePromptSubmit = useCallback(async (prompt: string) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }
    if (!selectedModel) {
      alert("Please select a model before sending a prompt.");
      return;
    }
    
    let historyForGeneration: ChatMessage[];
    
    if (prompt.trim() || attachedFiles.length > 0) {
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
        historyForGeneration = [...chatHistory, newUserMessage];
        setChatHistory(historyForGeneration);
        setAttachedFiles([]);
    } else {
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage?.role === 'user') {
            historyForGeneration = [...chatHistory];
        } else {
            return;
        }
    }


    setIsLoading(true);
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
    
    // Add a placeholder for the upcoming model response. This will be updated or removed.
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
                                    // The cleaned text for the history is only what comes *after* the thought block.
                                    cleanedText = textToClean.substring(lastEndTagIndex + endTag.length).trim();
                                }
                                
                                return { ...part, text: cleanedText };
                            }
                            return part;
                        })
                        .filter(part => {
                            // Filter out parts that become empty after cleaning,
                            // but keep non-text parts (like function calls).
                            if ('text' in part) {
                                return !!part.text;
                            }
                            return true;
                        });

                    return { ...message, parts: newParts };
                }
                return message;
            }).filter(message => message.parts.length > 0);
        };

        let historyForApi = cleanHistory(historyForGeneration);
        const isCoderMode = selectedMode.includes('coder');
        const shouldUseStreaming = isStreamingEnabled && !isCoderMode;
        
        if (projectContext) {
             const filteredContext: ProjectContext = { files: new Map(), dirs: new Set() };

             const isPathExcluded = (path: string): boolean => {
               if (excludedPaths.has(path)) return true;
               for (const excluded of excludedPaths) {
                 // Exclude if it's a descendant of an excluded folder
                 if (path.startsWith(excluded + '/')) {
                   return true;
                 }
               }
               return false;
             };
         
             for (const [path, content] of projectContext.files.entries()) {
               if (!isPathExcluded(path)) {
                 filteredContext.files.set(path, content);
               }
             }
             for (const path of projectContext.dirs) {
               if (!isPathExcluded(path)) {
                 filteredContext.dirs.add(path);
               }
             }

             const fileContext = FileSystem.serializeProjectContext(filteredContext);
             
             const contextPreamble = isCoderMode 
                ? `The user has provided this project context. Use your tools to operate on it. Do not output this context in your response.`
                : `The user has provided the following files as context for their request. Use the contents of these files to inform your answer. Do not mention this context message in your response unless the user asks about it.`;

             const contextMessage: ChatMessage = {
                 role: 'user',
                 parts: [{ text: `${contextPreamble}\n\n${fileContext}`}]
             };
             // Inject the context message before the last message (the user's actual prompt).
             historyForApi.splice(historyForApi.length - 1, 0, contextMessage);
        }
        
        // Inject the Chain-of-Thought priming message before every API call in coder mode.
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
        if (isCoderMode && !projectContext) {
            systemInstruction = (mode as any).systemInstructionNoProject;
        }

        let tools;
        if (isCoderMode) {
            let coderTools = [...FILE_SYSTEM_TOOLS];
            if (!projectContext) {
                coderTools.unshift({
                    name: 'createProject',
                    description: 'Initializes a new project, giving it a name. This MUST be the first tool called when creating a new multi-file project from scratch. Do not use this if a project is already synced.',
                    parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: 'The name of the project, e.g., "React Website".' } }, required: ['name'] }
                });
            }
            tools = [{ functionDeclarations: coderTools }];
        }

        if (shouldUseStreaming) {
            const stream = generateContentStreamWithRetries(
                apiKey, selectedModel, historyForApi, systemInstruction,
                cancellationRef, onStatusUpdate, cancellableSleep
            );

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
                            newHistory[newHistory.length - 1] = {
                                ...lastMessage,
                                parts: [{ text: fullResponseText }]
                            };
                        }
                        return newHistory;
                    });
                }
            }
            if (cancellationRef.current) throw new Error('Cancelled by user');

            if (!fullResponseText.trim()) {
                setChatHistory(prev => prev.slice(0, -1));
            }
        } else {
            const response = await generateContentWithRetries(
                apiKey, selectedModel, historyForApi, systemInstruction, tools,
                cancellationRef, onStatusUpdate, cancellableSleep
            );

            if (cancellationRef.current) throw new Error('Cancelled by user');

            const modelResponseText = response.text;
            const functionCalls = response.functionCalls ?? [];

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
                    let accumulatedContext = projectContext;
                    let accumulatedDeleted = deletedItems;

                    if (!projectContext) {
                        const hasFsCalls = functionCalls.some(fc =>
                            FILE_SYSTEM_TOOLS.some(tool => tool.name === fc.name) || fc.name === 'createProject'
                        );
                        if (hasFsCalls) {
                            accumulatedContext = { files: new Map(), dirs: new Set() };
                            setOriginalProjectContext(accumulatedContext);
                        }
                    }

                    if (accumulatedContext) {
                        const functionResponses: ChatPart[] = [];
                        for (const fc of functionCalls) {
                            if (cancellationRef.current) throw new Error('Cancelled by user');
                            
                            if (fc.name === 'createProject') {
                                functionResponses.push({
                                    functionResponse: {
                                        name: fc.name,
                                        response: { success: true, message: `Project '${fc.args?.name || 'Untitled'}' created.` }
                                    }
                                });
                                continue;
                            }

                            const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext, accumulatedDeleted);
                            accumulatedContext = newContext;
                            accumulatedDeleted = newDeleted;
                            functionResponses.push({
                                functionResponse: { name: fc.name!, response: result }
                            });
                        }
                        
                        if (cancellationRef.current) throw new Error('Cancelled by user');
            
                        setProjectContext(accumulatedContext);
                        setDeletedItems(accumulatedDeleted);
                        
                        const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                        setChatHistory(prev => [...prev, toolResponseMessage]);
                    }
                }
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
  }, [apiKey, chatHistory, attachedFiles, selectedModel, selectedMode, projectContext, deletedItems, excludedPaths, isStreamingEnabled]);


  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isMobile={isMobile}
        onProjectSync={handleProjectSync}
        displayContext={displayContext}
        originalContext={originalProjectContext}
        deletedItems={deletedItems}
        onUnlinkProject={handleUnlinkProject}
        onOpenFileEditor={handleOpenFileEditor}
        excludedPaths={excludedPaths}
        onTogglePathExclusion={handleTogglePathExclusion}
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}
        chatHistory={chatHistory}
        isLoading={isLoading}
        attachedFiles={attachedFiles}
        setAttachedFiles={setAttachedFiles}
        isReadingFiles={isReadingFiles}
        setIsReadingFiles={setIsReadingFiles}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onSubmit={handlePromptSubmit}
        onStop={handleStopGeneration}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        modes={MODES}
        sendWithCtrlEnter={sendWithCtrlEnter}
        apiKey={apiKey}
        setApiKey={setApiKey}
        onDeleteMessage={handleDeleteMessage}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        sendWithCtrlEnter={sendWithCtrlEnter}
        setSendWithCtrlEnter={setSendWithCtrlEnter}
        isStreamingEnabled={isStreamingEnabled}
        setStreamingEnabled={setIsStreamingEnabled}
      />
      {editingFile && (
        <FileEditorModal
          filePath={editingFile.path}
          initialContent={editingFile.content}
          onClose={handleCloseFileEditor}
          onSave={handleSaveFile}
        />
      )}
    </div>
  );
};

export default App;