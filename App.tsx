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
import { ImageIcon } from './components/icons';

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
  const [isDragging, setIsDragging] = useState(false);
  const cancellationRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creatingIn, setCreatingIn] = useState<{ path: string; type: 'file' | 'folder' } | null>(null);
  
  useEffect(() => {
    if (!apiKey) {
      setIsSettingsModalOpen(true);
    }
  }, [apiKey]);
  
  useEffect(() => {
    // This context is for rendering the file tree. It shows everything: current + deleted.
    const mergedFiles = new Map<string, string>([
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

    if (newContext.files.size > 0 || newContext.dirs.size > 0) {
        setDisplayContext(newContext);
    } else {
        setDisplayContext(null);
    }
  }, [projectContext, deletedItems]);

  const handleNewChat = () => {
    setChatHistory([]);
    setProjectContext(null);
    setOriginalProjectContext(null);
    setDeletedItems(EMPTY_CONTEXT);
    setExcludedPaths(new Set());
    setCreatingIn(null);
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };
  
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const handleStopGeneration = useCallback(() => {
    cancellationRef.current = true;
  }, []);

  const handleAddFiles = useCallback(async (fileList: FileList) => {
    setIsReadingFiles(true);
    try {
      const files = Array.from(fileList);
      
      const fileContents: { path: string, content: string }[] = [];
      for (const file of files) {
        // For single file adds, we use the file name as the path (no relative path)
        const path = file.name;
        try {
          // This simplified text check is for display purposes. For the model, all files are context.
          const isText = file.type.startsWith('text/') || file.size < 1000000; // Heuristic: Read files under 1MB as text
          if (isText) {
             const content = await file.text();
             fileContents.push({ path, content });
          } else {
             fileContents.push({ path, content: `[Binary file: ${file.name} (${file.type}). Content not displayed.]`});
          }
        } catch (e) {
            console.warn(`Could not read file ${path} as text. Treating as binary.`, e);
            fileContents.push({ path, content: `[Binary file: ${file.name} (${file.type}). Content not displayed.]`});
        }
      }

      setProjectContext(prev => {
          let tempContext = prev ? { files: new Map(prev.files), dirs: new Set(prev.dirs) } : EMPTY_CONTEXT;
          for (const { path, content } of fileContents) {
              tempContext = FileSystem.createFile(path, content, tempContext);
          }
          if (!originalProjectContext && tempContext.files.size > 0) {
              setOriginalProjectContext(EMPTY_CONTEXT); // Mark that a project exists, but diffs are against an empty state
          }
          return tempContext;
      });

    } finally {
      setIsReadingFiles(false);
    }
  }, [originalProjectContext]);

  // Handler for replacing the entire project with an uploaded folder.
  const handleFolderUpload = useCallback(async (fileList: FileList) => {
    setIsReadingFiles(true);
    try {
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
            const path = (file as any).webkitRelativePath;
            const isGitPath = /(^|\/)\.git(\/|$)/.test(path);

            if (path && !isIgnored(path) && !isGitPath) {
                try {
                    const content = await file.text();
                    newProjectContext.files.set(path, content);
                    const parts = path.split('/');
                    let currentPath = '';
                    for (let i = 0; i < parts.length - 1; i++) {
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
    } finally {
        setIsReadingFiles(false);
    }
  }, []);

  useEffect(() => {
    let dragOverTimeout: number | undefined;

    const hideOverlay = () => {
      setIsDragging(false);
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(dragOverTimeout);
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsDragging(true);
      }
    };
    
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(dragOverTimeout);
      dragOverTimeout = window.setTimeout(hideOverlay, 150);
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(dragOverTimeout);
      hideOverlay();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleAddFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      clearTimeout(dragOverTimeout);
    };
  }, [handleAddFiles]);

  const handleUnlinkProject = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all files? This cannot be undone.')) {
        setProjectContext(null);
        setOriginalProjectContext(null);
        setDeletedItems(EMPTY_CONTEXT);
        setExcludedPaths(new Set());
    }
  }, []);

  const handleOpenFileEditor = useCallback((path: string) => {
    const content = projectContext?.files.get(path);
    if (content !== undefined) {
        setEditingFile({ path, content });
    }
  }, [projectContext]);

  const handleSaveFile = useCallback((path: string, newContent: string) => {
    setProjectContext(prev => {
        const context = prev ?? { files: new Map(), dirs: new Set() };
        return FileSystem.createFile(path, newContent, context);
    });
  }, []);

  const handleCloseFileEditor = () => {
    setEditingFile(null);
  };
  
  const handleTogglePathExclusion = useCallback((path: string) => {
    const allDirs = new Set([
        ...(projectContext?.dirs || []),
        ...(deletedItems.dirs || [])
    ]);
    const allFiles = new Map([
        ...(projectContext?.files || []),
        ...(deletedItems.files || [])
    ]);

    const isDirectory = allDirs.has(path) || Array.from(allFiles.keys()).some(p => p.startsWith(`${path}/`));

    setExcludedPaths(prev => {
        const newSet = new Set(prev);
        
        if (!isDirectory) {
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        }

        const shouldExclude = !newSet.has(path);
        const allPaths = new Set([...allFiles.keys(), ...allDirs]);
        const pathsToToggle = [path, ...Array.from(allPaths).filter(p => p.startsWith(`${path}/`))];

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
            return prevHistory.filter((_, index) => index !== indexToDelete && index !== indexToDelete + 1);
        } else {
            return prevHistory.filter((_, index) => index !== indexToDelete);
        }
    });
  }, []);

  const handleCreateFile = useCallback((path: string) => {
    setProjectContext(prev => {
        const context = prev ?? EMPTY_CONTEXT;
        if (FileSystem.pathExists(path, context)) {
            alert(`Error: Path "${path}" already exists.`);
            return context;
        }
        return FileSystem.createFile(path, '', context);
    });
  }, []);

  const handleCreateFolder = useCallback((path: string) => {
    setProjectContext(prev => {
        const context = prev ?? EMPTY_CONTEXT;
         if (FileSystem.pathExists(path, context)) {
            alert(`Error: Path "${path}" already exists.`);
            return context;
        }
        return FileSystem.createFolder(path, context);
    });
  }, []);

  const handleDeletePath = useCallback((path: string) => {
    if (window.confirm(`Are you sure you want to delete "${path}"? This cannot be undone.`)) {
        setProjectContext(prev => {
            if (!prev) return null;
            const subtreeToDelete = FileSystem.extractSubtree(path, prev);

             if (subtreeToDelete.files.size > 0 || subtreeToDelete.dirs.size > 0) {
                 setDeletedItems(currentDeleted => ({
                    files: new Map([...currentDeleted.files, ...subtreeToDelete.files]),
                    dirs: new Set([...currentDeleted.dirs, ...subtreeToDelete.dirs])
                }));
             }
            return FileSystem.deletePath(path, prev);
        });
    }
  }, []);

  const handleRenamePath = useCallback((oldPath: string, newPath: string) => {
    setProjectContext(prev => {
        const context = prev ?? EMPTY_CONTEXT;
        if (FileSystem.pathExists(newPath, context)) {
            alert(`Error: Path "${newPath}" already exists.`);
            return context;
        }
        return FileSystem.movePath(oldPath, newPath, context);
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
    
    if (prompt.trim()) {
        const newUserMessage: ChatMessage = { role: 'user', parts: [{ text: prompt }] };
        historyForGeneration = [...chatHistory, newUserMessage];
        setChatHistory(historyForGeneration);
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
    
    setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

    try {
        const cleanHistory = (history: ChatMessage[]): ChatMessage[] => {
            return history.map(message => {
                if (message.role === 'model') {
                    const newParts = message.parts.map(part => {
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
                    }).filter(part => ('text' in part) ? !!part.text : true);
                    return { ...message, parts: newParts };
                }
                return message;
            }).filter(message => message.parts.length > 0);
        };

        let historyForApi = cleanHistory(historyForGeneration);
        const isCoderMode = selectedMode.includes('coder');
        const shouldUseStreaming = isStreamingEnabled && !isCoderMode;
        
        if (projectContext && projectContext.files.size > 0) {
             const filteredContext: ProjectContext = { files: new Map(), dirs: new Set() };

             const isPathExcluded = (path: string): boolean => {
               if (excludedPaths.has(path)) return true;
               for (const excluded of excludedPaths) {
                 if (path.startsWith(`${excluded}/`)) return true;
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
             
             const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer. If they ask you to modify files, use the file system tools you have been provided. Do not mention this context message in your response unless the user asks about it.`;

             const contextMessage: ChatMessage = {
                 role: 'user',
                 parts: [{ text: `${contextPreamble}\n\n${fileContext}`}]
             };
             historyForApi.splice(historyForApi.length - 1, 0, contextMessage);
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
        const systemInstruction = mode.systemInstruction;
        const tools = [{ functionDeclarations: FILE_SYSTEM_TOOLS }];

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
                        accumulatedContext = EMPTY_CONTEXT;
                        setOriginalProjectContext(EMPTY_CONTEXT);
                    }

                    if (accumulatedContext) {
                        const functionResponses: ChatPart[] = [];
                        for (const fc of functionCalls) {
                            if (cancellationRef.current) throw new Error('Cancelled by user');
                            
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
  }, [apiKey, chatHistory, selectedModel, selectedMode, projectContext, deletedItems, excludedPaths, isStreamingEnabled]);


  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
       {isDragging && (
        <div className="absolute inset-0 bg-blue-900/40 border-2 border-dashed border-blue-400 rounded-2xl z-50 flex items-center justify-center pointer-events-none animate-fade-in m-2">
          <div className="text-center text-white p-6 bg-black/60 rounded-xl backdrop-blur-sm">
            <ImageIcon size={48} className="mx-auto mb-3 text-blue-300" />
            <p className="text-xl font-bold">Drop files to add to project</p>
            <p className="text-sm text-gray-300">Images, text, code, PDFs and more</p>
          </div>
        </div>
      )}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
        className="hidden"
      />
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isMobile={isMobile}
        onProjectSync={handleFolderUpload}
        displayContext={displayContext}
        originalContext={originalProjectContext}
        deletedItems={deletedItems}
        onUnlinkProject={handleUnlinkProject}
        onOpenFileEditor={handleOpenFileEditor}
        excludedPaths={excludedPaths}
        onTogglePathExclusion={handleTogglePathExclusion}
        isLoading={isLoading}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onDeletePath={handleDeletePath}
        onRenamePath={handleRenamePath}
        creatingIn={creatingIn}
        setCreatingIn={setCreatingIn}
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}
        chatHistory={chatHistory}
        isLoading={isLoading}
        // These are removed as App now manages file state globally
        attachedFiles={[]} 
        setAttachedFiles={() => {}}
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
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default App;