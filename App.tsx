
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import FileEditorModal from './components/FileEditorModal';
import type { ChatMessage, AttachedFile, Mode, ModeId, ProjectContext, ChatPart } from './types';
import { generateContentStream } from './services/geminiService';
import { useApiKey } from './hooks/useApiKey';
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
        name: 'readFile',
        description: 'Reads the content of a file at a given path.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
    },
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
        name: 'listFiles',
        description: 'Lists the files and directories in a given path.',
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


const App: React.FC = () => {
  const isMobile = useWindowSize();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-pro'); // Pro for function calling
  const [apiKey, setApiKey] = useApiKey();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ModeId>('default');
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const cancellationRef = useRef(false);
  
  useEffect(() => {
    if (!apiKey) {
      setIsSettingsModalOpen(true);
    }
  }, [apiKey]);

  const handleNewChat = () => {
    setChatHistory([]);
    setProjectContext(null); // Also clear project context
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
  }, []);

  const handleUnlinkProject = useCallback(() => {
    if (window.confirm('Are you sure you want to unlink the project context?')) {
        setProjectContext(null);
    }
  }, []);

  const handleOpenFileEditor = useCallback((path: string) => {
    if (projectContext?.files.has(path)) {
        setEditingFile({ path, content: projectContext.files.get(path)! });
    }
  }, [projectContext]);

  const handleSaveFile = useCallback((path: string, newContent: string) => {
    setProjectContext(prev => {
        if (!prev) return null;
        return FileSystem.createFile(path, newContent, prev);
    });
  }, []);

  const handleCloseFileEditor = () => {
    setEditingFile(null);
  };


  const executeFunctionCall = useCallback(async (fc: FunctionCall): Promise<any> => {
    const { name, args } = fc;
    let result: any = { success: true };
    // FIX: Function call arguments can be undefined, handle this case.
    if (!args) {
      return { success: false, error: `Function call '${name || 'unknown'}' is missing arguments.` };
    }

    try {
        switch (name) {
            case 'readFile':
                // FIX: Cast function call argument from unknown to string.
                result = projectContext?.files.get(args.path as string) || `File not found: ${args.path as string}`;
                break;
            case 'writeFile':
                // FIX: Cast function call arguments from unknown to string.
                setProjectContext(prev => FileSystem.createFile(args.path as string, args.content as string, prev!));
                result.message = `Wrote to ${args.path as string}`;
                break;
            case 'createFolder':
                // FIX: Cast function call argument from unknown to string.
                setProjectContext(prev => FileSystem.createFolder(args.path as string, prev!));
                result.message = `Created folder ${args.path as string}`;
                break;
            case 'listFiles':
                const allPaths = [...projectContext!.files.keys(), ...projectContext!.dirs];
                // FIX: Cast function call argument from unknown to string.
                const listPath = args.path as string;
                result = allPaths.filter(p => p.startsWith(`${listPath}/`) && p.split('/').length === listPath.split('/').length + 1);
                break;
            case 'move':
                // FIX: Cast function call arguments from unknown to string.
                setProjectContext(prev => FileSystem.movePath(args.sourcePath as string, args.destinationPath as string, prev!));
                result.message = `Moved ${args.sourcePath as string} to ${args.destinationPath as string}`;
                break;
            case 'deletePath':
                // FIX: Cast function call argument from unknown to string.
                setProjectContext(prev => FileSystem.deletePath(args.path as string, prev!));
                result.message = `Deleted ${args.path as string}`;
                break;
            default:
                result = { success: false, error: `Unknown function: ${name}` };
        }
    } catch (e) {
        result = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    return result;
  }, [projectContext]);

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
    
    try {
        let historyForApi = [...updatedChatHistory];
        const isCoderMode = selectedMode.includes('coder');

        if (projectContext && isCoderMode) {
             const fileContext = FileSystem.serializeProjectContext(projectContext);
             const contextMessage: ChatMessage = {
                 role: 'user',
                 parts: [{ text: `The user has provided this project context. Use your tools to operate on it. Do not output this context in your response.\n\n${fileContext}`}]
             };
             historyForApi.splice(historyForApi.length - 1, 0, contextMessage);
        }

        while (true) {
            if (cancellationRef.current) break;
            const systemInstruction = MODES[selectedMode].systemInstruction;
            const tools = isCoderMode ? [{ functionDeclarations: FILE_SYSTEM_TOOLS }] : undefined;

            const stream = await generateContentStream(apiKey, selectedModel, historyForApi, systemInstruction, tools);

            let modelResponseText = "";
            let functionCalls: FunctionCall[] = [];
            
            const modelMessagePlaceholder: ChatMessage = { role: 'model', parts: [{ text: '' }] };
            setChatHistory(prev => [...prev, modelMessagePlaceholder]);

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
                const modelTurnWithFunctionCall: ChatMessage = {
                    role: 'model',
                    parts: functionCalls.map(fc => ({ functionCall: fc }))
                };
                setChatHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[newHistory.length - 1] = modelTurnWithFunctionCall;
                    return newHistory;
                });

                const functionResponses: ChatPart[] = [];
                for (const fc of functionCalls) {
                    const result = await executeFunctionCall(fc);
                    functionResponses.push({
                        functionResponse: {
                            name: fc.name!,
                            response: result ,
                        }
                    });
                }

                const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                historyForApi.push(modelTurnWithFunctionCall, toolResponseMessage);
                setChatHistory(prev => [...prev, toolResponseMessage]);
            } else {
                break; // No function calls, done with this turn.
            }
        }

    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}` }]
      };
      setChatHistory(prev => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setIsLoading(false);
      cancellationRef.current = false;
    }
  }, [apiKey, chatHistory, selectedModel, selectedMode, projectContext, executeFunctionCall]);

  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isMobile={isMobile}
        onProjectSync={handleProjectSync}
        projectContext={projectContext}
        onUnlinkProject={handleUnlinkProject}
        onOpenFileEditor={handleOpenFileEditor}
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}
        chatHistory={chatHistory}
        isLoading={isLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onSubmit={handlePromptSubmit}
        onStop={handleStopGeneration}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        modes={MODES}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
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