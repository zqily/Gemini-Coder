import React, { useState, useCallback, useEffect, useRef, ReactNode, useMemo } from 'react';
import { FileSystemContext, FileSystemContextType, EMPTY_CONTEXT } from './FileSystemContext';
import { useProjectContext } from './useProjectContext';
import * as FileSystem from './utils/fileSystem';
import type { ProjectContext, FileSystemDirectoryHandle } from '../../types';
import type { FunctionCall } from '@google/genai';
import type { ChatPart } from '../../types';
import { countTextTokensApprox, countImageTokensApprox } from '../chat/utils/tokenCounter';
import { fileToDataURL } from '../chat/utils/fileUpload';
import { readDirectoryHandle, applyChangesToDisk as applyChangesToDiskUtil } from './utils/diskAccess';
import { useToast } from '../toast/ToastContext';

const areContextsEqual = (a: ProjectContext | null, b: ProjectContext | null): boolean => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.dirs.size !== b.dirs.size || a.files.size !== b.files.size) return false;
    for (const dir of a.dirs) if (!b.dirs.has(dir)) return false;
    for (const [path, content] of a.files) if (b.files.get(path) !== content) return false;
    return true;
};

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
    revertProjectChangesInHook,
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
  const { showToast } = useToast();

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
  const [rootDirHandle, setRootDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const hasUnappliedChanges = useMemo(() => {
    const hasModifications = !areContextsEqual(originalProjectContext, projectContext);
    const hasDeletions = deletedItems.files.size > 0 || deletedItems.dirs.size > 0;
    return hasModifications || hasDeletions;
  }, [originalProjectContext, projectContext, deletedItems]);

  useEffect(() => {
    // FIX: Explicitly type Map and Set to avoid inference issues with spread syntax.
    const mergedFiles = new Map<string, string>([
      ...(deletedItems?.files || []),
      ...(projectContext?.files || [])
    ]);
    // FIX: Explicitly type Map and Set to avoid inference issues with spread syntax.
    const mergedDirs = new Set<string>([
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
    const calculateTokens = async () => {
      if (!displayContext) {
        setFileTokenCounts(new Map());
        return;
      }
      
      const newCounts = new Map<string, number>();
      const imageTokenPromises: Promise<void>[] = [];

      for (const [path, content] of displayContext.files.entries()) {
        if (content.startsWith('data:image/')) {
            const mimeType = content.substring(5, content.indexOf(';'));
            const promise = countImageTokensApprox({ name: path, content, type: mimeType, size: 0 })
                .then(count => { newCounts.set(path, count); });
            imageTokenPromises.push(promise);
        } else if (content.startsWith('[Attached file:') || content.startsWith('[Binary file:')) {
          newCounts.set(path, 0);
        } else {
          newCounts.set(path, countTextTokensApprox(content));
        }
      }

      await Promise.all(imageTokenPromises);
      
      const allDirs = new Set(displayContext.dirs);
      allDirs.add('');
      const sortedDirs = Array.from(allDirs).sort((a, b) => b.length - a.length);
  
      for (const dirPath of sortedDirs) {
        let dirTotal = 0;
        for (const [path, count] of newCounts.entries()) {
          const parentIndex = path.lastIndexOf('/');
          const parentDir = parentIndex === -1 ? '' : path.substring(0, parentIndex);
          if (parentDir === dirPath) {
            dirTotal += count;
          }
        }
        newCounts.set(dirPath, dirTotal);
      }
      
      setFileTokenCounts(newCounts);
    };
    calculateTokens();
  }, [displayContext]);


  const syncProject = useCallback(async () => {
    if (!(window as any).showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.');
      return;
    }
    setIsReadingFiles(true);
    try {
      const handle = await (window as any).showDirectoryPicker();
      setRootDirHandle(handle);
      const newContext = await readDirectoryHandle(handle);
      setProjectContext(newContext);
      setOriginalProjectContext(newContext);
      setDeletedItems(EMPTY_CONTEXT);
      setExcludedPaths(new Set());
      const allDirs = new Set(newContext.dirs);
      allDirs.add('');
      setExpandedFolders(allDirs);
      showToast('Project synced successfully!', 'success');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled picker, do nothing.
      } else {
        console.error('Error syncing project:', err);
        showToast('Failed to sync project.', 'error');
      }
    } finally {
      setIsReadingFiles(false);
    }
  }, [setProjectContext, setOriginalProjectContext, setDeletedItems, setExcludedPaths, setExpandedFolders, showToast]);

  const applyChangesToDisk = useCallback(async () => {
    if (!rootDirHandle || !originalProjectContext || !projectContext) {
      showToast('Cannot apply changes: no project synced.', 'error');
      return;
    }
    try {
      await applyChangesToDiskUtil(rootDirHandle, originalProjectContext, projectContext, deletedItems);
      setOriginalProjectContext(projectContext);
      setDeletedItems(EMPTY_CONTEXT);
      showToast('Changes applied to local disk!', 'success');
    } catch (err) {
      console.error('Failed to apply changes:', err);
      showToast(`Error applying changes: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  }, [rootDirHandle, originalProjectContext, projectContext, deletedItems, showToast, setOriginalProjectContext, setDeletedItems]);

  const revertChanges = useCallback(() => {
    if (window.confirm('Are you sure you want to revert all virtual changes? This will restore the state from your last sync/apply.')) {
      revertProjectChangesInHook();
      showToast('Virtual changes have been reverted.', 'success');
    }
  }, [revertProjectChangesInHook, showToast]);

  const handleAddFiles = useCallback(async (fileList: FileList) => {
    setRootDirHandle(null);
    setIsReadingFiles(true);
    try {
      const files = Array.from(fileList);
      
      const fileContents: { path: string, content: string }[] = [];
      for (const file of files) {
        const path = file.name;
        if (file.type.startsWith('image/')) {
            try {
                const dataURL = await fileToDataURL(file);
                fileContents.push({ path, content: dataURL });
            } catch(e) {
                console.warn(`Could not read image file ${path} as dataURL. Treating as binary.`, e);
                fileContents.push({ path, content: `[Binary file: ${file.name} (${file.type}). Content not displayed.]`});
            }
        } else {
            try {
                const content = await file.text();
                fileContents.push({ path, content });
            } catch (e) {
                console.warn(`Could not read file ${path} as text. Treating as binary.`, e);
                fileContents.push({ path, content: `[Binary file: ${file.name} (${file.type}). Content not displayed.]`});
            }
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
        setRootDirHandle(null);
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
    const content = projectContext?.files.get(path) ?? deletedItems.files.get(path);
    if (content !== undefined) {
        setEditingFile({ path, content });
    }
  }, [projectContext, deletedItems]);

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
    
    rootDirHandle,
    hasUnappliedChanges,
    syncProject,
    unlinkProject,
    clearProjectContext: unlinkProjectInHook,
    applyChangesToDisk,
    revertChanges,
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