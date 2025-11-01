import { useState, useCallback } from 'react';
import type { ProjectContext, ChatPart } from '../../types';
import * as FileSystem from './utils/fileSystem';
import { createIsIgnored } from './utils/gitignore';
import { executeFunctionCall } from './utils/functionCalling';
import type { FunctionCall } from '@google/genai';
import { EMPTY_CONTEXT } from './FileSystemContext';


export const useProjectContext = () => {
    const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
    const [originalProjectContext, setOriginalProjectContext] = useState<ProjectContext | null>(null);
    const [deletedItems, setDeletedItems] = useState<ProjectContext>(EMPTY_CONTEXT);
    const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());

    // NOTE: syncProject and updateDisplayContext are moved to FileSystemProvider

    const unlinkProject = useCallback(() => {
        setProjectContext(null);
        setOriginalProjectContext(null);
        setDeletedItems(EMPTY_CONTEXT);
        setExcludedPaths(new Set());
    }, []);

    const revertProjectChangesInHook = useCallback(() => {
        if (originalProjectContext) {
            setProjectContext(originalProjectContext);
        } else {
            setProjectContext(null);
        }
        setDeletedItems(EMPTY_CONTEXT);
    }, [originalProjectContext]);

    const saveFile = useCallback((path: string, newContent: string) => {
        setProjectContext(prev => {
            const context = prev ?? EMPTY_CONTEXT;
            return FileSystem.createFile(path, newContent, context);
        });
    }, []);

    const togglePathExclusion = useCallback((path: string) => {
        const allDirs = new Set([...(projectContext?.dirs || []), ...(deletedItems.dirs || [])]);
        // FIX: Explicitly type the new Map to prevent keys from being inferred as 'unknown'.
        const allFiles = new Map<string, string>([...(projectContext?.files || []), ...(deletedItems.files || [])]);
        const isDirectory = allDirs.has(path) || Array.from(allFiles.keys()).some(p => p.startsWith(`${path}/`));

        setExcludedPaths(prev => {
            const newSet = new Set(prev);
            
            if (!isDirectory) {
                if (newSet.has(path)) newSet.delete(path);
                else newSet.add(path);
                return newSet;
            }

            const shouldExclude = !newSet.has(path);
            const allPaths = new Set([...allFiles.keys(), ...allDirs]);
            const pathsToToggle = [path, ...Array.from(allPaths).filter(p => p.startsWith(`${path}/`))];

            for (const p of pathsToToggle) {
                if (shouldExclude) newSet.add(p);
                else newSet.delete(p);
            }
            return newSet;
        });
    }, [projectContext, deletedItems]);

    const getSerializableContext = useCallback((): string | null => {
        if (!projectContext) return null;
        
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
        return FileSystem.serializeProjectContext(filteredContext);
    }, [projectContext, excludedPaths]);

    // This now directly modifies the state within the hook
    const applyFunctionCalls = useCallback((functionCalls: FunctionCall[]): ChatPart[] => {
        let accumulatedContext = projectContext ?? EMPTY_CONTEXT;
        let accumulatedDeleted = deletedItems;
        const functionResponses: ChatPart[] = [];

        for (const fc of functionCalls) {
            const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext, accumulatedDeleted);
            accumulatedContext = newContext;
            accumulatedDeleted = newDeleted;
            functionResponses.push({
                functionResponse: { name: fc.name!, response: result }
            });
        }
        
        setProjectContext(accumulatedContext);
        setDeletedItems(accumulatedDeleted);

        return functionResponses;
    }, [projectContext, deletedItems]);
    
    const createFile = useCallback((path: string, content: string) => {
        setProjectContext(prev => {
            const context = prev ?? EMPTY_CONTEXT;
            if (FileSystem.pathExists(path, context)) {
                alert(`Error: Path "${path}" already exists.`);
                return context;
            }
            return FileSystem.createFile(path, content, context);
        });
    }, []);

    const createFolder = useCallback((path: string) => {
        setProjectContext(prev => {
            const context = prev ?? EMPTY_CONTEXT;
             if (FileSystem.pathExists(path, context)) {
                alert(`Error: Path "${path}" already exists.`);
                return context;
            }
            return FileSystem.createFolder(path, context);
        });
    }, []);

    const deletePath = useCallback((path: string) => {
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

    const movePath = useCallback((oldPath: string, newPath: string) => {
        setProjectContext(prev => {
            const context = prev ?? EMPTY_CONTEXT;
            if (FileSystem.pathExists(newPath, context)) {
                alert(`Error: Path "${newPath}" already exists.`);
                return context;
            }
            return FileSystem.movePath(oldPath, newPath, context);
        });
    }, []);


    return {
        projectContext,
        originalProjectContext,
        deletedItems,
        excludedPaths,
        setProjectContext,
        setOriginalProjectContext,
        setDeletedItems,
        setExcludedPaths,
        revertProjectChangesInHook,
        unlinkProject,
        saveFile,
        togglePathExclusion,
        getSerializableContext,
        applyFunctionCalls,
        createFile,
        createFolder,
        deletePath,
        movePath,
    };
};