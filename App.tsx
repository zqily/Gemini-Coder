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
import { MODES, FILE_SYSTEM_TOOLS, NO_PROBLEM_DETECTED_TOOL } from './config/modes';
import { Type, FunctionCall, GenerateContentResponse } from '@google/genai';
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
            const isIgnoreFile = /(^|\/)\.gitignore$/.test(path) || /(^|\/)\.gcignore$/.test(path);

            if (path && !isIgnored(path) && !isGitPath && !isIgnoreFile) {
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
    
    let activeModel = selectedModel;
    if (!activeModel && selectedMode !== 'advanced-coder') {
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

    const getProjectContextString = (): string | null => {
        if (!projectContext || projectContext.files.size === 0) return null;
        const filteredContext: ProjectContext = { files: new Map(), dirs: new Set() };
        const isPathExcluded = (path: string): boolean => {
          if (excludedPaths.has(path)) return true;
          for (const excluded of excludedPaths) {
            if (path.startsWith(`${excluded}/`)) return true;
          }
          return false;
        };
        for (const [path, content] of projectContext.files.entries()) {
            if (!isPathExcluded(path)) filteredContext.files.set(path, content);
        }
        for (const path of projectContext.dirs) {
            if (!isPathExcluded(path)) filteredContext.dirs.add(path);
        }
        return FileSystem.serializeProjectContext(filteredContext);
    };
    
    const thinkPrimerMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: "Alright, before providing the final response, I will think step-by-step through the reasoning process and put it inside a <think> block using this format:\n\n```jsx\n<think>\nHuman request: (My interpretation of Human's request)\nHigh-level Plan: (A high level plan of what I'm going to do)\nDetailed Plan: (A more detailed plan that expands on the above plan)\n</think>\n```" }]
    };
    
    // Schema for both Simple and Advanced coder final implementation
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
            let baseHistory = [...historyForGeneration];
            const projectFileContext = getProjectContextString();
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
                    let accumulatedContext = projectContext ?? EMPTY_CONTEXT;
                    if (!projectContext) setOriginalProjectContext(EMPTY_CONTEXT);
                    let accumulatedDeleted = deletedItems;
                    const functionResponses: ChatPart[] = [];

                    for (const fc of functionCalls) {
                        if (cancellationRef.current) throw new Error('Cancelled by user');
                        const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext, accumulatedDeleted);
                        accumulatedContext = newContext;
                        accumulatedDeleted = newDeleted;
                        functionResponses.push({ functionResponse: { name: fc.name!, response: result } });
                    }
                    
                    if (cancellationRef.current) throw new Error('Cancelled by user');
        
                    setProjectContext(accumulatedContext);
                    setDeletedItems(accumulatedDeleted);
                    
                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                }
            }
        } else if (selectedMode === 'simple-coder' && projectContext) {
            let historyForApi = [...historyForGeneration];
            const projectFileContext = getProjectContextString();
            if (projectFileContext) {
                 const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer.`;
                 historyForApi.splice(historyForApi.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}`}] });
            }
            historyForApi.push(thinkPrimerMessage);
            
            const systemInstruction = MODES['simple-coder'].systemInstruction!;
            const modelConfig = { responseMimeType: "application/json", responseSchema: fileOpsResponseSchema };
            
            // Use Pro model for reliability with JSON schema
            const response = await generateContentWithRetries(apiKey, 'gemini-2.5-pro', historyForApi, systemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep, modelConfig);
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
                    let accumulatedContext = projectContext ?? EMPTY_CONTEXT;
                    if (!projectContext) setOriginalProjectContext(EMPTY_CONTEXT);
                    let accumulatedDeleted = deletedItems;
                    const functionResponses: ChatPart[] = [];

                    for (const fc of functionCalls) {
                        if (cancellationRef.current) throw new Error('Cancelled by user');
                        const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext, accumulatedDeleted);
                        accumulatedContext = newContext;
                        accumulatedDeleted = newDeleted;
                        functionResponses.push({ functionResponse: { name: fc.name!, response: result } });
                    }
                    
                    if (cancellationRef.current) throw new Error('Cancelled by user');
        
                    setProjectContext(accumulatedContext);
                    setDeletedItems(accumulatedDeleted);
                    
                    const toolResponseMessage: ChatMessage = { role: 'tool', parts: functionResponses };
                    setChatHistory(prev => [...prev, toolResponseMessage]);
                }
            }

        } else {
            // Default mode, or Simple Coder without a project
            let historyForApi = [...historyForGeneration];
            const shouldUseStreaming = isStreamingEnabled;
            
            const projectFileContext = getProjectContextString();
            if (projectFileContext) {
                 const contextPreamble = `The user has provided the following files as context for their request. Use the contents of these files to inform your answer. Do not mention this context message in your response unless the user asks about it.`;
                 historyForApi.splice(historyForApi.length - 1, 0, { role: 'user', parts: [{ text: `${contextPreamble}\n\n${projectFileContext}`}] });
            }
            
            const mode = MODES[selectedMode];
            const systemInstruction = mode.systemInstruction;
            
            if (shouldUseStreaming) {
                const stream = generateContentStreamWithRetries( apiKey, activeModel, historyForApi, systemInstruction, cancellationRef, onStatusUpdate, cancellableSleep );
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
                const response = await generateContentWithRetries( apiKey, activeModel, historyForApi, systemInstruction, undefined, cancellationRef, onStatusUpdate, cancellableSleep );
                if (cancellationRef.current) throw new Error('Cancelled by user');
                const modelResponseText = response.text;
               
                if (!modelResponseText) {
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