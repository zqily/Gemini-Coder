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
  const [highlightedPath, setHighlightedPathInternal] = useState<string | null>(null);
  const [fadingPath, setFadingPath] = useState<{ path: string; fast: boolean } | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

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

    // 2. Calculate for all dirs by summing direct children (files and subdirs)
    // Also add the root path '' to the set of directories to be calculated.
    const allDirs = new Set(displayContext.dirs);
    allDirs.add('');
    const sortedDirs = Array.from(allDirs).sort((a, b) => b.length - a.length);

    for (const dirPath of sortedDirs) {
      let dirTotal = 0;
      // Iterate over all items we have counts for so far (files and already-calculated subdirs)
      for (const [path, count] of newCounts.entries()) {
        // Find the parent directory of the current item path
        const parentIndex = path.lastIndexOf('/');
        const parentDir = parentIndex === -1 ? '' : path.substring(0, parentIndex);
        
        // If the item's parent is the directory we're currently calculating, add its token count
        if (parentDir === dirPath) {
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

  const clearHighlightedPath = useCallback((fast: boolean) => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedPathInternal(currentPath => {
      if (currentPath) {
        setFadingPath({ path: currentPath, fast });
        setTimeout(() => {
          setFadingPath(current => (current?.path === currentPath ? null : current));
        }, fast ? 500 : 2000); // Animation durations
      }
      return null;
    });
  }, []);

  const setHighlightedPath = useCallback((path: string) => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    setFadingPath(null); // Clear any old fading path
    setHighlightedPathInternal(path);

    // Pulse for 18s, then start a 2s fade out. Total 20s.
    highlightTimeoutRef.current = window.setTimeout(() => {
      clearHighlightedPath(false); // slow fade
    }, 18000);
  }, [clearHighlightedPath]);


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
    highlightedPath,
    fadingPath,
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
    setHighlightedPath,
    clearHighlightedPath,
  };

  return (
    <FileSystemContext.Provider value={contextValue}>
      {children}
    </FileSystemContext.Provider>
  );
};

export default FileSystemProvider;
