import type { ProjectContext, FileSystemDirectoryHandle, FileSystemFileHandle } from '../../../types';
import { fileToDataURL } from '../../chat/utils/fileUpload';
import { createIsIgnored } from './gitignore';

/**
 * Recursively reads a directory and its contents, returning a ProjectContext.
 * Respects .gitignore and .gcignore files found at the root.
 */
export async function readDirectoryHandle(directoryHandle: FileSystemDirectoryHandle): Promise<ProjectContext> {
  const context: ProjectContext = { files: new Map(), dirs: new Set() };
  let isIgnored = (path: string) => false;

  // Check for and parse ignore files at the root
  let combinedIgnoreContent = '';
  try {
    const gitignoreHandle = await directoryHandle.getFileHandle('.gitignore');
    const gitignoreFile = await gitignoreHandle.getFile();
    combinedIgnoreContent += await gitignoreFile.text() + '\n';
  } catch (e) { /* .gitignore not found, ignore */ }
  try {
    const gcignoreHandle = await directoryHandle.getFileHandle('.gcignore');
    const gcignoreFile = await gcignoreHandle.getFile();
    combinedIgnoreContent += await gcignoreFile.text();
  } catch (e) { /* .gcignore not found, ignore */ }

  if (combinedIgnoreContent.trim()) {
    isIgnored = createIsIgnored(combinedIgnoreContent);
  }

  async function traverse(handle: FileSystemDirectoryHandle, currentPath: string) {
    for await (const [name, entry] of handle.entries()) {
      const entryPath = currentPath ? `${currentPath}/${name}` : name;
      
      const isGitPath = /(^|\/)\.git(\/|$)/.test(entryPath);
      const isIgnoreFile = /(^|\/)\.gitignore$/.test(entryPath) || /(^|\/)\.gcignore$/.test(entryPath);

      if (isIgnored(entryPath) || isGitPath || isIgnoreFile) {
        continue;
      }

      if (entry.kind === 'directory') {
        context.dirs.add(entryPath);
        await traverse(entry, entryPath);
      } else if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (file.type.startsWith('image/')) {
          try {
            const dataURL = await fileToDataURL(file);
            context.files.set(entryPath, dataURL);
          } catch (e) {
            console.warn(`Could not read image ${entryPath}. Skipping.`, e);
          }
        } else {
          try {
            const content = await file.text();
            context.files.set(entryPath, content);
          } catch (e) {
             context.files.set(entryPath, `[Binary file: ${file.name}. Content not displayed.]`);
          }
        }
      }
    }
  }

  await traverse(directoryHandle, '');
  return context;
}

/**
 * Applies changes from the virtual file system to the local disk.
 */
export async function applyChangesToDisk(
  rootDirHandle: FileSystemDirectoryHandle,
  originalContext: ProjectContext,
  currentContext: ProjectContext,
  deletedItems: ProjectContext
) {
  // 1. Handle Deletions
  for (const path of deletedItems.dirs) {
    if (originalContext.dirs.has(path)) {
      const parts = path.split('/');
      const name = parts.pop()!;
      const parentHandle = await getParentHandle(rootDirHandle, parts);
      await parentHandle.removeEntry(name, { recursive: true });
    }
  }
  for (const path of deletedItems.files.keys()) {
     if (originalContext.files.has(path)) {
        const parts = path.split('/');
        const name = parts.pop()!;
        const parentHandle = await getParentHandle(rootDirHandle, parts);
        await parentHandle.removeEntry(name);
     }
  }

  // 2. Handle Additions and Modifications
  for (const [path, content] of currentContext.files.entries()) {
    const originalContent = originalContext.files.get(path);
    if (content !== originalContent) { // This covers both new and modified files
      const parts = path.split('/');
      const name = parts.pop()!;
      const parentHandle = await getParentHandle(rootDirHandle, parts, true);
      const fileHandle = await parentHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    }
  }
}

async function getParentHandle(
    rootDirHandle: FileSystemDirectoryHandle, 
    parts: string[], 
    create = false
): Promise<FileSystemDirectoryHandle> {
    let currentHandle = rootDirHandle;
    for (const part of parts) {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create });
    }
    return currentHandle;
}