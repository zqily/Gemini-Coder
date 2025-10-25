import type { FunctionCall } from '@google/genai';
import type { ProjectContext, AttachedFile } from '../../../types';
import * as FileSystem from './fileSystem';

/**
 * A pure function that executes a file system operation based on a function call from the model.
 * It takes the current project context and returns the new context after the operation.
 * It does not have any side effects (like calling React state setters).
 * @param fc The FunctionCall object from the model.
 * @param currentContext The current state of the project files and directories.
 * @param currentDeleted The current state of deleted items.
 * @returns An object containing the result of the operation and the new project/deleted contexts.
 */
export const executeFunctionCall = (
    fc: FunctionCall, 
    currentContext: ProjectContext, 
    currentDeleted: ProjectContext,
): { result: any, newContext: ProjectContext, newDeleted: ProjectContext } => {
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
