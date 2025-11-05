import React from 'react';
import type { ChatMessage, AttachedFile, Mode, ModeId, ChatPart, AdvancedCoderState, IndicatorState } from '../../types';
import type { FunctionCall } from '@google/genai';

export interface ChatContextType {
  chatHistory: ChatMessage[];
  isLoading: boolean; // Overall loading state (chat processing or file reading)
  attachedFiles: AttachedFile[];
  selectedModel: string;
  selectedMode: ModeId;
  modes: Record<ModeId, Mode>;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  totalTokens: number;
  advancedCoderState: AdvancedCoderState | null;
  indicatorState: IndicatorState;

  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  setSelectedModel: (model: string) => void;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  onNewChat: () => void;
  setSelectedMode: (mode: ModeId) => void;
  onDeleteMessage: (index: number) => void;
  onFileAddClick: () => void; // This will trigger the file input managed by ChatProvider for attached files
  onRetryLastAdvancedCoderPhase: () => void;

  // From FileSystemContext (consumed by ChatProvider and re-exposed if needed by its children)
  isReadingFilesFs: boolean; // Filesystem file reading status, used to compute overall isLoading
}

export const ChatContext = React.createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = React.useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};