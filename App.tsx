import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import FileEditorModal from './components/FileEditorModal';
import type { ChatMessage, AttachedFile, Mode, ModeId, ProjectContext, ChatPart } from './types';
import { generateContentStreamWithRetries } from './services/geminiService';
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
    systemInstruction: "You are an expert programmer. Your primary purpose is to help the user with their code. You have been granted a set of tools to modify a virtual file system. Use these tools when the user asks for code changes, new files, or refactoring. Announce which files you are modifying before you make a change. When you are finished with all file modifications, let the user know you are done."
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

    const gitignoreFile = files.find(f => f.name.endsWith('.gitignore'));
    if (gitignoreFile) {
      const gitignoreContent = await gitignoreFile.text();
      isIgnored = createIsIgnored(gitignoreContent);
    }
    
    const newProjectContext: ProjectContext = { files: new Map(), dirs: new Set() };
    for (const file of files) {
        // webkitRelativePath is the property that contains the full path
        const path = (file as any).webkitRelativePath;

        // Hardcoded rule to always ignore the .git directory
        const isGitPath = /(^|\/)\.git(\/|$)/.test(path);

        if (path && !isIgnored(path) && !isGitPath) {
            const content = await file.text();
            newProjectContext.files.set(path, content);
            // Add parent directories
            const parts = path.split('/');
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                newProjectContext.dirs.add(currentPath);
            }
        }
    }
    setProjectContext(newProjectContext);
    setOriginalProjectContext(newProjectContext);
    setDeletedItems(EMPTY_CONTEXT);
  }, []);

  const handleUnlinkProject = useCallback(() => {
    if (window.confirm('Are you sure you want to unlink the project context?')) {
        setProjectContext(null);
        setOriginalProjectContext(null);
        setDeletedItems(EMPTY_CONTEXT);
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

    try {
        let historyForApi = [...updatedChatHistory];
        const isCoderMode = selectedMode.includes('coder');

        // These local variables will hold the most up-to-date context within the function-calling loop
        let currentProjectContext = projectContext;
        let currentDeletedItems = deletedItems;

        let functionCallLoop = true;
        while (functionCallLoop) {
            if (cancellationRef.current) break;
            
            // Create a temporary history for this specific API call with the fresh context
            const historyForThisTurn = [...historyForApi];
            if (currentProjectContext && isCoderMode) {
                 const fileContext = FileSystem.serializeProjectContext(currentProjectContext);
                 const contextMessage: ChatMessage = {
                     role: 'user',
                     parts: [{ text: `The user has provided this project context. Use your tools to operate on it. Do not output this context in your response.\n\n${fileContext}`}]
                 };
                 // Inject the context message before the last message (the user's actual prompt or a tool response).
                 // This provides the model with the latest state before it acts.
                 historyForThisTurn.splice(historyForThisTurn.length - 1, 0, contextMessage);
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

            // Add a placeholder for the upcoming model response
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

            try {
                const systemInstruction = MODES[selectedMode].systemInstruction;
                const tools = isCoderMode ? [{ functionDeclarations: FILE_SYSTEM_TOOLS }] : undefined;

                const stream = await generateContentStreamWithRetries(
                    apiKey, selectedModel, historyForThisTurn, systemInstruction, tools,
                    cancellationRef, onStatusUpdate, cancellableSleep
                );

                let modelResponseText = "";
                let functionCalls: FunctionCall[] = [];
                
                for await (const chunk of stream) {
                    if (cancellationRef.current) break;
                    
                    const part = chunk.candidates?.[0]?.content?.parts?.[0];
                    if (part?.text) {
                        modelResponseText += part.text;
                        setChatHistory(prev => {
                            const newHistory = [...prev];
                            newHistory[newHistory.length - 1] = { role: 'model', parts: [{ text: modelResponseText }] };
                            return newHistory;
                        });
                    } else if (part?.functionCall) {
                        functionCalls.push(part.functionCall);
                    }
                }

                if (cancellationRef.current) break;

                if (functionCalls.length > 0) {
                    const modelTurnParts: ChatPart[] = [];
                    if (modelResponseText) {
                        modelTurnParts.push({ text: modelResponseText });
                    }
                    modelTurnParts.push(...functionCalls.map(fc => ({ functionCall: fc })));

                    const modelTurnWithMessage: ChatMessage = {
                        role: 'model',
                        parts: modelTurnParts
                    };
                    
                    setChatHistory(prev => {
                        const newHistory = [...prev];
                        newHistory[newHistory.length - 1] = modelTurnWithMessage;
                        return newHistory;
                    });

                    // Batch process all function calls from the model's response
                    let accumulatedContext = currentProjectContext;
                    let accumulatedDeleted = currentDeletedItems;
                    const functionResponses: ChatPart[] = [];

                    for (const fc of functionCalls) {
                        if (cancellationRef.current) break; // Check for cancellation before executing each function call

                        const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext!, accumulatedDeleted);
                        
                        // Update local accumulators for the next function call in this batch
                        accumulatedContext = newContext;
                        accumulatedDeleted = newDeleted;

                        functionResponses.push({
                            functionResponse: {
                                name: fc.name!,
                                response: result,
                            }
                        });
                    }
                    
                    if (cancellationRef.current) break;

                    // Update React state once with the final accumulated context for this turn
                    setProjectContext(accumulatedContext);
                    setDeletedItems(accumulatedDeleted);
                    
                    // Also update the local context variables for the next iteration of the outer `while` loop
                    currentProjectContext = accumulatedContext;
                    currentDeletedItems = accumulatedDeleted;

                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    
                    // Add the model's turn and the tool responses to the main history for the next loop iteration
                    historyForApi.push(modelTurnWithMessage, toolResponseMessage);
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                } else {
                    functionCallLoop = false; // No function calls, done with this turn.
                }

            } catch(error) {
                // This catches final, unrecoverable errors from the retry wrapper, or cancellation.
                console.error("Content generation failed after retries:", error);
                functionCallLoop = false; // Exit the function-calling loop
            }
        }

    } catch (error) {
      console.error("A critical error occurred during prompt submission setup:", error);
      const errorMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}` }]
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      cancellationRef.current = false;
    }
  }, [apiKey, chatHistory, selectedModel, selectedMode, projectContext, deletedItems]);

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
