
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import FileEditorModal from './components/FileEditorModal';
import type { ChatMessage, AttachedFile, Mode, ModeId, ProjectContext, ChatPart } from './types';
import { generateContentWithRetries } from './services/geminiService';
import { useApiKey } from './hooks/useApiKey';
import { useSendShortcutSetting } from './hooks/useSendShortcutSetting';
import { useSelectedMode } from './hooks/useSelectedMode';
import { Bot, CodeXml } from './components/icons';
import { createIsIgnored } from './utils/gitignore';
import * as FileSystem from './utils/fileSystem';
import { FunctionDeclaration, Type, FunctionCall } from '@google/genai';

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

const MODES: Record<ModeId, Mode> = {
  'default': {
    id: 'default',
    name: 'Default',
    icon: Bot,
    systemInstruction: undefined,
  },
  'simple-coder': {
    id: 'simple-coder',
    name: 'Simple Coder',
    icon: CodeXml,
    systemInstruction: `You are an expert programmer. Your primary purpose is to help the user with their code. You have been granted a set of tools to modify a virtual file system. Use these tools when the user asks for code changes, new files, or refactoring.

**Crucially, you must complete the user's entire request in a single turn. Do not perform one file modification and then stop. You must plan all the required changes and then issue all the necessary function calls in the same response.** Announce which files you are modifying before you make a change. When you are finished with all file modifications, let the user know you are done and write a summary of your changes.`,
    systemInstructionNoProject: `You are an expert programmer. Your primary purpose is to help the user with their code. Write all code directly into your response. When you are finished, let the user know you are done and write a summary of the code you provided.`
  }
};

const FILE_SYSTEM_TOOLS: FunctionDeclaration[] = [
    {
        name: 'writeFile',
        description: 'Writes content to a file at a given path. Creates the file if it does not exist, and overwrites it if it does.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ['path', 'content'] }
    },
    {
        name: 'createFolder',
        description: 'Creates a new directory at a given path.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
    },
    {
        name: 'move',
        description: 'Moves or renames a file or folder.',
        parameters: { type: Type.OBJECT, properties: { sourcePath: { type: Type.STRING }, destinationPath: { type: Type.STRING } }, required: ['sourcePath', 'destinationPath'] }
    },
    {
        name: 'deletePath',
        description: 'Deletes a file or folder at a given path.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
    }
];

const EMPTY_CONTEXT: ProjectContext = { files: new Map(), dirs: new Set() };

/**
 * A pure function that executes a file system operation based on a function call from the model.
 * It takes the current project context and returns the new context after the operation.
 * It does not have any side effects (like calling React state setters).
 * @param fc The FunctionCall object from the model.
 * @param currentContext The current state of the project files and directories.
 * @param currentDeleted The current state of deleted items.
 * @returns An object containing the result of the operation and the new project/deleted contexts.
 */
const executeFunctionCall = (fc: FunctionCall, currentContext: ProjectContext, currentDeleted: ProjectContext): { result: any, newContext: ProjectContext, newDeleted: ProjectContext } => {
    const { name, args } = fc;
    let result: any = { success: true };
    let newContext = currentContext;
    let newDeleted = currentDeleted;

    if (!args) {
        return { result: { success: false, error: `Function call '${name || 'unknown'}' is missing arguments.` }, newContext, newDeleted };
    }

    try {
        switch (name) {
            case 'writeFile':
                newContext = FileSystem.createFile(args.path as string, args.content as string, currentContext);
                result.message = `Wrote to ${args.path as string}`;
                break;
            case 'createFolder':
                newContext = FileSystem.createFolder(args.path as string, currentContext);
                result.message = `Created folder ${args.path as string}`;
                break;
            case 'move':
                newContext = FileSystem.movePath(args.sourcePath as string, args.destinationPath as string, currentContext);
                result.message = `Moved ${args.sourcePath as string} to ${args.destinationPath as string}`;
                break;
            case 'deletePath':
                const pathToDelete = args.path as string;
                const subtreeToDelete = FileSystem.extractSubtree(pathToDelete, currentContext);
                
                if (subtreeToDelete.files.size > 0 || subtreeToDelete.dirs.size > 0) {
                    newDeleted = {
                        files: new Map([...currentDeleted.files, ...subtreeToDelete.files]),
                        dirs: new Set([...currentDeleted.dirs, ...subtreeToDelete.dirs])
                    };
                    newContext = FileSystem.deletePath(pathToDelete, currentContext);
                    result.message = `Deleted ${pathToDelete}`;
                } else {
                     result = { success: false, error: `Path not found for deletion: ${pathToDelete}` };
                }
                break;
            default:
                result = { success: false, error: `Unknown function: ${name}` };
        }
    } catch (e) {
        result = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    return { result, newContext, newDeleted };
};


const App: React.FC = () => {
  const isMobile = useWindowSize();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-pro'); // Pro for function calling
  const [apiKey, setApiKey] = useApiKey();
  const [sendWithCtrlEnter, setSendWithCtrlEnter] = useSendShortcutSetting();
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

  const handlePromptSubmit = useCallback(async (prompt: string, files: AttachedFile[]) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }
    if (!prompt.trim() && files.length === 0) return;

    setIsLoading(true);
    cancellationRef.current = false;

    const userParts: ChatPart[] = [];
    if (prompt) userParts.push({ text: prompt });
    files.forEach(file => {
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

        let historyForApi = cleanHistory(updatedChatHistory);
        const isCoderMode = selectedMode.includes('coder');
        const isProjectSynced = projectContext !== null;
        
        if (projectContext && isCoderMode) {
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
             const contextMessage: ChatMessage = {
                 role: 'user',
                 parts: [{ text: `The user has provided this project context. Use your tools to operate on it. Do not output this context in your response.\n\n${fileContext}`}]
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
        const functionCalls = response.functionCalls ?? [];

        // If we got nothing, just remove the placeholder and we're done.
        if (!modelResponseText && functionCalls.length === 0) {
            setChatHistory(prev => prev.slice(0, -1));
        } else {
             // Construct the final model message parts
            const modelTurnParts: ChatPart[] = [];
            if (modelResponseText) {
                modelTurnParts.push({ text: modelResponseText });
            }
            functionCalls.forEach(fc => modelTurnParts.push({ functionCall: fc }));
    
            const modelTurnWithMessage: ChatMessage = {
                role: 'model',
                parts: modelTurnParts
            };

            // Replace the placeholder with the final model message
            setChatHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = modelTurnWithMessage;
                return newHistory;
            });

            // If there were function calls, execute them now
            if (functionCalls.length > 0) {
                // Batch process all function calls from the model's response
                let accumulatedContext = projectContext;
                let accumulatedDeleted = deletedItems;
                const functionResponses: ChatPart[] = [];
    
                for (const fc of functionCalls) {
                    if (cancellationRef.current) throw new Error('Cancelled by user');
    
                    const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext!, accumulatedDeleted);
                    
                    accumulatedContext = newContext;
                    accumulatedDeleted = newDeleted;
    
                    functionResponses.push({
                        functionResponse: {
                            name: fc.name!,
                            response: result,
                        }
                    });
                }
                
                if (cancellationRef.current) throw new Error('Cancelled by user');
    
                // Update React state once with the final accumulated context for this turn
                setProjectContext(accumulatedContext);
                setDeletedItems(accumulatedDeleted);
                
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
          // Replace the placeholder message with the error.
          setChatHistory(prev => {
              const newHistory = [...prev];
              newHistory[newHistory.length - 1] = errorMessage;
              return newHistory;
          });
      } else {
          // If cancelled, just remove the placeholder message.
          setChatHistory(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      cancellationRef.current = false;
    }
  }, [apiKey, chatHistory, selectedModel, selectedMode, projectContext, deletedItems, excludedPaths]);


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
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        sendWithCtrlEnter={sendWithCtrlEnter}
        setSendWithCtrlEnter={setSendWithCtrlEnter}
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
