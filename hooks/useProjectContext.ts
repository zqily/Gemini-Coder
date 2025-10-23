import { useState, useCallback } from 'react';
import type { ProjectContext, AttachedFile, ChatPart } from '../types';
import * as FileSystem from '../utils/fileSystem';
import { createIsIgnored } from '../utils/gitignore';
import { executeFunctionCall } from '../utils/functionCalling';
import type { FunctionCall } from '@google/genai';


const EMPTY_CONTEXT: ProjectContext = { files: new Map(), dirs: new Set() };

export const useProjectContext = () => {
    const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
    const [originalProjectContext, setOriginalProjectContext] = useState<ProjectContext | null>(null);
    const [deletedItems, setDeletedItems] = useState<ProjectContext>(EMPTY_CONTEXT);
    const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
    const [displayContext, setDisplayContext] = useState<ProjectContext | null>(null);

    const updateDisplayContext = useCallback((attachedFiles: AttachedFile[]) => {
        // FIX: Add explicit types to new Map() to avoid it being Map<unknown, unknown>.
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

        attachedFiles.forEach(file => {
            const isText = file.type.startsWith('text/') ||
                ['json', 'xml', 'javascript', 'typescript', 'csv', 'markdown', 'html', 'css'].some(t => file.type.includes(t));

            if (isText) {
                try {
                    const base64Content = file.content.split(',')[1];
                    if (base64Content) {
                        const textContent = atob(base64Content);
                        newContext.files.set(file.name, textContent);
                    } else {
                        newContext.files.set(file.name, '');
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
    }, [projectContext, deletedItems]);

    const syncProject = useCallback(async (fileList: FileList) => {
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
    }, []);

    const unlinkProject = useCallback(() => {
        setProjectContext(null);
        setOriginalProjectContext(null);
        setDeletedItems(EMPTY_CONTEXT);
        setExcludedPaths(new Set());
    }, []);

    const saveFile = useCallback((path: string, newContent: string) => {
        setProjectContext(prev => {
            const context = prev ?? { files: new Map(), dirs: new Set() };
            return FileSystem.createFile(path, newContent, context);
        });
    }, []);

    const togglePathExclusion = useCallback((path: string) => {
        const allDirs = new Set([...(projectContext?.dirs || []), ...(deletedItems.dirs || [])]);
        const allFiles = new Map([...(projectContext?.files || []), ...(deletedItems.files || [])]);
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
                // FIX: Coerce 'excluded' to string using a template literal to satisfy strict type checking.
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

    // FIX: Update function signature to accept attachedFilesMap.
    const applyFunctionCalls = useCallback((functionCalls: FunctionCall[], attachedFilesMap: Map<string, AttachedFile>): ChatPart[] => {
        let accumulatedContext = projectContext;
        let accumulatedDeleted = deletedItems;
        const functionResponses: ChatPart[] = [];

        for (const fc of functionCalls) {
            // FIX: Pass the attachedFilesMap to executeFunctionCall, which now expects four arguments.
            // FIX: Corrected function call to pass 3 arguments instead of 4, matching the function definition.
            const { result, newContext, newDeleted } = executeFunctionCall(fc, accumulatedContext!, accumulatedDeleted);
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
    
    return {
        projectContext,
        originalProjectContext,
        deletedItems,
        excludedPaths,
        displayContext,
        updateDisplayContext,
        syncProject,
        unlinkProject,
        saveFile,
        togglePathExclusion,
        getSerializableContext,
        applyFunctionCalls,
    };
};