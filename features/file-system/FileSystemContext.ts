import React from 'react';
import type { ProjectContext, AttachedFile, ChatPart } from '../../types';
import type { FunctionCall } from '@google/genai';

export const EMPTY_CONTEXT: ProjectContext = { files: new Map(), dirs: new Set() };

export interface FileSystemContextType {
  projectContext: ProjectContext | null;
  originalProjectContext: ProjectContext | null;
  deletedItems: ProjectContext;
  excludedPaths: Set<string>;
  displayContext: ProjectContext | null;
  editingFile: { path: string; content: string } | null;
  isReadingFiles: boolean;
  isDragging: boolean;
  creatingIn: { path: string; type: 'file' | 'folder' } | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  fileTokenCounts: Map<string, number>;
  
  syncProject: (fileList: FileList) => Promise<void>;
  unlinkProject: () => void;
  saveFile: (path: string, newContent: string) => void;
  togglePathExclusion: (path: string) => void;
  getSerializableContext: () => string | null;
  applyFunctionCalls: (functionCalls: FunctionCall[]) => Promise<ChatPart[]>;
  setEditingFile: (file: { path: string; content: string } | null) => void;
  handleCloseFileEditor: () => void;
  onOpenFileEditor: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onDeletePath: (path: string) => void;
  onRenamePath: (oldPath: string, newPath: string) => void;
  setCreatingIn: (state: { path: string; type: 'file' | 'folder' } | null) => void;
  handleGlobalDragEnter: (e: DragEvent) => void;
  handleGlobalDragOver: (e: DragEvent) => void;
  handleGlobalDrop: (e: DragEvent) => void;
  handleDragLeave: (e: DragEvent) => void;
  handleAddFiles: (fileList: FileList) => Promise<void>;
}

export const FileSystemContext = React.createContext<FileSystemContextType | undefined>(undefined);

export const useFileSystem = () => {
  const context = React.useContext(FileSystemContext);
  if (!context) {
    throw new Error('useFileSystem must be used within a FileSystemProvider');
  }
  return context;
};
