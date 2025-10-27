import React from 'react';
export type ModeId = 'default' | 'simple-coder' | 'advanced-coder';
export interface Mode {
  id: ModeId;
  name: string;
  systemInstruction?: string;
  systemInstructionNoProject?: string;
  icon: React.ElementType;
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
    args?: { [key: string]: any };
  };
}

export interface FunctionResponsePart {
  functionResponse: {
    name: string;
    response: { [key: string]: any };
  };
}

export type ChatPart = TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart;

export interface ChatMessage {
  role: 'user' | 'model' | 'tool';
  parts: ChatPart[];
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
