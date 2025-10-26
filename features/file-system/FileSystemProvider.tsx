import React, { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { FileSystemContext, FileSystemContextType, EMPTY_CONTEXT } from './FileSystemContext';
import { useProjectContext } from './useProjectContext';
import { createIsIgnored } from './utils/gitignore';
import * as FileSystem from './utils/fileSystem';
import type { ProjectContext } from '../../types';
import type { FunctionCall } from '@google/genai';
import type { ChatPart } from '../../types';
import { countTextTokens } from '../chat/utils/tokenCounter';

interface FileSystemProviderProps {
  children: ReactNode;
}

const FileSystemProvider: React.FC<FileSystemProviderProps> = ({ children }) => {
  const {
    projectContext,
    originalProjectContext,
    deletedItems,
    excludedPaths,
    setProjectContext,
    setOriginalProjectContext,
    setDeletedItems,
    setExcludedPaths,
    saveFile: saveFileInHook,
    togglePathExclusion: togglePathExclusionInHook,
    getSerializableContext,
    applyFunctionCalls: applyFunctionCallsInHook,
    createFile: createFileInHook,
    createFolder: createFolderInHook,
    deletePath: deletePathInHook,
    movePath: movePathInHook,
    unlinkProject: unlinkProjectInHook,
  } = useProjectContext();

  const [displayContext, setDisplayContext] = useState<ProjectContext | null>(null);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creatingIn, setCreatingIn] = useState<{ path: string; type: 'file' | 'folder' } | null>(null);
  const [fileTokenCounts, setFileTokenCounts] = useState<Map<string, number>>(new Map());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['']));
  const dragOverTimeout = useRef<number | undefined>(undefined);
  const dragCounter = useRef(0);

  useEffect(() => {
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

  useEffect(() => {
    if (!displayContext) {
      setFileTokenCounts(new Map());
      return;
    }

    const newCounts = new Map<string, number>();
    
    // 1. Calculate for all files
    for (const [path, content] of displayContext.files.entries()) {
      if (content.startsWith('[Attached file:') || content.startsWith('[Binary file:')) {
        newCounts.set(path, 0);
      } else {
        newCounts.set(path, countTextTokens(content));
      }
    }

    // 2. Calculate for all dirs by summing children
    const sortedDirs = Array.from(displayContext.dirs).sort((a, b) => b.length - a.length);
    for (const dirPath of sortedDirs) {
      let dirTotal = 0;
      for (const [path, count] of newCounts.entries()) {
        if (path.startsWith(`${dirPath}/`)) {
          dirTotal += count;
        }
      }
      newCounts.set(dirPath, dirTotal);
    }
    
    setFileTokenCounts(newCounts);
  }, [displayContext]);


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
        const allDirs = new Set(newProjectContext.dirs);
        allDirs.add(''); // Always expand root
        setExpandedFolders(allDirs);
    } finally {
        setIsReadingFiles(false);
    }
  }, [setProjectContext, setOriginalProjectContext, setDeletedItems, setExcludedPaths, setExpandedFolders]);

  const handleAddFiles = useCallback(async (fileList: FileList) => {
    setIsReadingFiles(true);
    try {
      const files = Array.from(fileList);
      
      const fileContents: { path: string, content: string }[] = [];
      for (const file of files) {
        const path = file.name;
        try {
          const isText = file.type.startsWith('text/') || file.size < 1000000;
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
              setOriginalProjectContext(EMPTY_CONTEXT);
          }
          return tempContext;
      });

    } finally {
      setIsReadingFiles(false);
    }
  }, [originalProjectContext, setProjectContext, setOriginalProjectContext]);

  const handleGlobalDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(dragOverTimeout.current);
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounter.current++;
      setIsDragging(true);
    }
  }, []);
  
  const handleGlobalDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(dragOverTimeout.current);
    dragOverTimeout.current = window.setTimeout(() => setIsDragging(false), 150);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleGlobalDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(dragOverTimeout.current);
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  }, [handleAddFiles]);

  const unlinkProject = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all files? This cannot be undone.')) {
        unlinkProjectInHook();
        setExpandedFolders(new Set(['']));
    }
  }, [unlinkProjectInHook]);

  const saveFile = useCallback((path: string, newContent: string) => {
    saveFileInHook(path, newContent);
  }, [saveFileInHook]);

  const handleCloseFileEditor = () => {
    setEditingFile(null);
  };
  
  const handleOpenFileEditor = useCallback((path: string) => {
    const content = projectContext?.files.get(path);
    if (content !== undefined) {
        setEditingFile({ path, content });
    }
  }, [projectContext]);

  const togglePathExclusion = useCallback((path: string) => {
    togglePathExclusionInHook(path);
  }, [togglePathExclusionInHook]);
  
  const onCreateFile = useCallback((path: string) => {
    createFileInHook(path, '');
  }, [createFileInHook]);

  const onCreateFolder = useCallback((path: string) => {
    createFolderInHook(path);
  }, [createFolderInHook]);

  const onDeletePath = useCallback((path: string) => {
    deletePathInHook(path);
  }, [deletePathInHook]);

  const onRenamePath = useCallback((oldPath: string, newPath: string) => {
    movePathInHook(oldPath, newPath);
  }, [movePathInHook]);

  const applyFunctionCalls = useCallback(async (functionCalls: FunctionCall[]): Promise<ChatPart[]> => {
    const results = applyFunctionCallsInHook(functionCalls);
    return Promise.resolve(results);
  }, [applyFunctionCallsInHook]);


  const contextValue: FileSystemContextType = {
    projectContext,
    originalProjectContext,
    deletedItems,
    excludedPaths,
    displayContext,
    editingFile,
    isReadingFiles,
    isDragging,
    creatingIn,
    fileInputRef,
    fileTokenCounts,
    expandedFolders,
    setExpandedFolders,
    
    syncProject: handleFolderUpload,
    unlinkProject,
    clearProjectContext: unlinkProjectInHook,
    saveFile,
    togglePathExclusion,
    getSerializableContext,
    applyFunctionCalls,
    setEditingFile,
    handleCloseFileEditor,
    onOpenFileEditor: handleOpenFileEditor,
    onCreateFile,
    onCreateFolder,
    onDeletePath,
    onRenamePath,
    setCreatingIn,
    handleGlobalDragEnter,
    handleGlobalDragOver,
    handleGlobalDrop,
    handleDragLeave,
    handleAddFiles,
  };

  return (
    <FileSystemContext.Provider value={contextValue}>
      {children}
    </FileSystemContext.Provider>
  );
};

export default FileSystemProvider;