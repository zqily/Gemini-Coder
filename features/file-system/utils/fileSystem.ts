import type { ProjectContext } from '../../../types';

/**
 * Creates a new file in the project context.
 * Overwrites if the file already exists.
 * Creates parent directories if they don't exist.
 * @param path The full path of the file to create.
 * @param content The content of the file.
 * @param context The current project context.
 * @returns The updated project context.
 */
export const createFile = (path: string, content: string, context: ProjectContext): ProjectContext => {
  const newFiles = new Map(context.files);
  const newDirs = new Set(context.dirs);
  
  newFiles.set(path, content);

  // Ensure parent directories exist
  const parentPath = path.substring(0, path.lastIndexOf('/'));
  if (parentPath) {
    const parts = parentPath.split('/');
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!newDirs.has(currentPath)) {
        newDirs.add(currentPath);
      }
    }
  }

  return { files: newFiles, dirs: newDirs };
};

/**
 * Creates a new folder in the project context.
 * Creates parent directories if they don't exist.
 * @param path The full path of the folder to create.
 * @param context The current project context.
 * @returns The updated project context.
 */
export const createFolder = (path: string, context: ProjectContext): ProjectContext => {
    const newDirs = new Set(context.dirs);
    const parts = path.split('/');
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!newDirs.has(currentPath)) {
        newDirs.add(currentPath);
      }
    }
    return { ...context, dirs: newDirs };
};


/**
 * Deletes a file or folder from the project context.
 * If a folder is deleted, all its contents (files and subfolders) are also removed.
 * @param path The path of the file or folder to delete.
 * @param context The current project context.
 * @returns The updated project context.
 */
export const deletePath = (path: string, context: ProjectContext): ProjectContext => {
  const newFiles = new Map(context.files);
  const newDirs = new Set(context.dirs);

  // Check if it's a file
  if (newFiles.has(path)) {
    newFiles.delete(path);
  } else if (newDirs.has(path) || Array.from(newFiles.keys()).some(k => k.startsWith(`${path}/`))) {
    // It's a directory, delete it and all its contents
    newDirs.delete(path);
    // Delete all files within this directory
    for (const filePath of newFiles.keys()) {
      if (filePath.startsWith(`${path}/`)) {
        newFiles.delete(filePath);
      }
    }
    // Delete all subdirectories
    for (const dirPath of newDirs) {
      if (dirPath.startsWith(`${path}/`)) {
        newDirs.delete(dirPath);
      }
    }
  }

  return { files: newFiles, dirs: newDirs };
};

/**
 * Moves (renames) a file or folder.
 * @param sourcePath The original path.
 * @param destinationPath The new path.
 * @param context The current project context.
 * @returns The updated project context.
 */
export const movePath = (sourcePath: string, destinationPath: string, context: ProjectContext): ProjectContext => {
    let newContext = { ...context };
    
    // Check if it's a file
    if (context.files.has(sourcePath)) {
        const content = context.files.get(sourcePath)!;
        const afterDelete = deletePath(sourcePath, context);
        newContext = createFile(destinationPath, content, afterDelete);
    } else if (context.dirs.has(sourcePath) || Array.from(context.files.keys()).some(k => k.startsWith(`${sourcePath}/`))) { // It's a directory
        const afterDelete = deletePath(sourcePath, context);
        const newDirs = new Set(afterDelete.dirs);
        newDirs.add(destinationPath);
        
        const newFiles = new Map(afterDelete.files);
        // Move all files within the directory
        for(const [filePath, fileContent] of context.files.entries()) {
            if(filePath.startsWith(`${sourcePath}/`)) {
                const newFilePath = filePath.replace(sourcePath, destinationPath);
                newFiles.set(newFilePath, fileContent);
            }
        }
         // Move all subdirectories
        for(const dirPath of context.dirs) {
            if(dirPath.startsWith(`${sourcePath}/`)) {
                const newDirPath = dirPath.replace(sourcePath, destinationPath);
                newDirs.add(newDirPath);
            }
        }

        newContext = { files: newFiles, dirs: newDirs };
    }

    return newContext;
};

/**
 * Extracts a file or an entire directory tree from a project context.
 * @param path The path of the file or folder to extract.
 * @param context The project context to extract from.
 * @returns A new ProjectContext containing only the extracted items.
 */
export const extractSubtree = (path: string, context: ProjectContext): ProjectContext => {
  const subtree: ProjectContext = { files: new Map(), dirs: new Set() };
  
  // Check if it's a directory by seeing if it's in dirs or if any file path starts with it
  const isDir = context.dirs.has(path) || Array.from(context.files.keys()).some(k => k.startsWith(`${path}/`));

  if (isDir) {
    subtree.dirs.add(path);
    // Find child dirs
    for (const dir of context.dirs) {
      if (dir.startsWith(`${path}/`)) {
        subtree.dirs.add(dir);
      }
    }
    // Find child files
    for (const [filePath, content] of context.files.entries()) {
      if (filePath.startsWith(`${path}/`)) {
        subtree.files.set(filePath, content);
      }
    }
  } else if (context.files.has(path)) {
    subtree.files.set(path, context.files.get(path)!);
  }
  return subtree;
};


/**
 * Serializes the project context into a string format for the model prompt.
 * @param context The project context.
 * @returns A string representation of the file tree and contents.
 */
export const serializeProjectContext = (context: ProjectContext): string => {
  let output = 'File System Structure:\n';
  const allPaths = [...context.dirs, ...context.files.keys()].sort();
  
  const tree: any = {};
  for(const path of allPaths) {
      path.split('/').reduce((r, e) => r[e] = r[e] || {}, tree);
  }

  function printTree(node: any, prefix = ''): string {
      let result = '';
      const entries = Object.entries(node);
      entries.forEach(([key, value], index) => {
          const isLast = index === entries.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          result += `${prefix}${connector}${key}\n`;
          if (Object.keys(value as object).length > 0) {
              result += printTree(value, prefix + (isLast ? '    ' : '│   '));
          }
      });
      return result;
  }
  
  output += printTree(tree);
  output += '\nFile Contents:\n';

  for (const [path, content] of context.files.entries()) {
    output += `--- BEGIN FILE: ${path} ---\n`;
    output += `${content}\n`;
    output += `--- END FILE: ${path} ---\n\n`;
  }
  return output;
};

/**
 * Checks if a given path already exists in the context.
 * @param path The path to check.
 * @param context The project context.
 * @returns True if the path exists as a file or directory.
 */
export const pathExists = (path: string, context: ProjectContext): boolean => {
    return context.files.has(path) || context.dirs.has(path);
};
