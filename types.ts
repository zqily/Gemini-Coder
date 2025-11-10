import React from 'react';
import type { FunctionCall } from '@google/genai';

export type IndicatorState = 'loading' | 'error' | 'delay';

export type ModeId = 'default' | 'simple-coder' | 'advanced-coder';

export interface Mode {
  id: ModeId;
  name: string;
  systemInstruction?: string;
  systemInstructionNoProject?: string;
  icon: React.ElementType;
  phases?: {
    planning: string;
    consolidation: string;
    drafting: string;
    debugging: string;
    review: string;
    final: string;
  };
}

export interface PersonaSettings {
  persona: string; // key of SIMPLE_CODER_PERSONAS or 'custom'
  customInstruction: string;
}

export interface AdvancedCoderSettings {
  phaseCount: 3 | 6 | 9 | 12;
}

export interface TextPart {
  text: string;
}

export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface FunctionCallPart {
  functionCall: {
    name?: string;
    args?: { [key:string]: any };
  };
}

export interface FunctionResponsePart {
  functionResponse: {
    name: string;
    response: { [key:string]: any };
  };
}

export type ChatPart = TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart;

// FIX: Made `uri` and `title` optional to match the type from the @google/genai library.
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface AdvancedCoderRunContext {
  baseHistory: ChatMessage[];
  codeDraft: string;
  consolidatedReview: string;
  accumulatedFunctionCalls?: FunctionCall[];
}

export interface ChatMessage {
  role: 'user' | 'model' | 'tool';
  parts: ChatPart[];
  mode?: ModeId;
  groundingChunks?: GroundingChunk[];
  advancedCoderContext?: AdvancedCoderRunContext;
  advancedCoderState?: AdvancedCoderState;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // base64 data URL
}

export interface ProjectFile {
    path: string;
    content: string; // text content
}

export interface ProjectContext {
    files: Map<string, string>; // path -> content
    dirs: Set<string>;
}

// ---- New Types for Advanced Coder Progress ----

export interface AdvancedCoderSubtask {
  title: string;
  content: string;
}

export interface AdvancedCoderPhase {
  id: string;
  title:string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'error';
  output?: string; // For sequential phases
  subtasks?: AdvancedCoderSubtask[]; // For concurrent phases
}

export interface AdvancedCoderState {
  phases: AdvancedCoderPhase[];
  statusMessage: string; // For retry messages etc.
}

// These are simplified definitions for the File System Access API handles.

// This type might not be in all TS DOM library versions.
export interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

export interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

export interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}