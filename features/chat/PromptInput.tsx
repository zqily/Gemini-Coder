import React, { useState, useRef } from 'react';
import { Plus, Send, X, File as FileIcon, LoaderCircle, ImageIcon } from '../../components/icons';
import type { AttachedFile, Mode, ModeId, ChatMessage } from '../../types';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from './utils/fileUpload';


const PromptInput: React.FC = () => {
  const { 
    onSubmit, isLoading, onStop, onFileAddClick, // onFileAddClick from useChat
    selectedMode, setSelectedMode, modes, chatHistory,
    attachedFiles, setAttachedFiles // attachedFiles from useChat
  } = useChat();
  const { apiKey, sendWithCtrlEnter } = useSettings();

  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // The fileAttachInputRef and handleFileChange are now managed within ChatProvider
  // PromptInput receives onFileAddClick from ChatContext, which triggers the file input in ChatProvider.

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
        textarea.style.height = 'auto';
        const maxHeight = 200; // max-h-50
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  };
  
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;

    const lastMessage = chatHistory[chatHistory.length - 1];
    const canResend = lastMessage?.role === 'user';
    if (!prompt.trim() && !canResend && attachedFiles.length === 0) return; // Allow resend with attached files

    onSubmit(prompt);
    setPrompt('');
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sendWithCtrlEnter) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };
  
  const lastMessage = chatHistory[chatHistory.length - 1];
  const canResend = lastMessage?.role === 'user';
  
  const isSubmitDisabled = !apiKey || isLoading || (!prompt.trim() && !canResend && attachedFiles.length === 0);
  let submitButtonTitle = "Send prompt";
  if (!apiKey) {
      submitButtonTitle = "Please set your API key in settings";
  } else if (isLoading) {
      submitButtonTitle = "Generating...";
  } else if (!prompt.trim() && attachedFiles.length === 0) {
      if (canResend) {
        submitButtonTitle = "Resend last message";
      } else {
        submitButtonTitle = "Enter a prompt or add files";
      }
  }

  const handleRemoveAttachedFile = (fileName: string) => {
    setAttachedFiles(prev => prev.filter(f => f.name !== fileName));
  };


  return (
    <form onSubmit={handleSubmit} className="w-full bg-[#1e1f20] transition-all duration-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/50 flex flex-col">
      <div>
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            {Object.values(modes).map((mode: Mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSelectedMode(mode.id)}
                className={`p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  selectedMode === mode.id
                    ? 'bg-gray-600/70 text-white'
                    : 'bg-transparent text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
                title={mode.name}
                aria-label={mode.name}
              >
                {React.createElement(mode.icon, { size: 18, 'aria-hidden': true })}
              </button>
            ))}
        </div>

        {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-gray-700/50 max-h-24 overflow-y-auto custom-scrollbar">
                {attachedFiles.map(file => (
                    <span key={file.name} className="flex items-center gap-1 bg-gray-700/50 text-xs px-2 py-1 rounded-full text-gray-300">
                        {file.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileIcon size={12} />}
                        {file.name}
                        <button type="button" onClick={() => handleRemoveAttachedFile(file.name)} className="ml-1 p-0.5 rounded-full hover:bg-gray-600">
                            <X size={10} />
                        </button>
                    </span>
                ))}
            </div>
        )}

        <div className="p-2 flex items-end w-full relative">
          {/* This button now uses onFileAddClick from ChatContext, which triggers the file input in ChatProvider */}
          <button
            type="button"
            onClick={onFileAddClick}
            disabled={isLoading}
            className="p-2 mr-1 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0 self-center"
            aria-label="Attach files to chat"
            title="Attach files to chat"
          >
          {isLoading ? <LoaderCircle className="animate-spin" size={24} /> : <Plus size={24} />}
          </button>
          
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextareaInput}
            placeholder={sendWithCtrlEnter ? "Ask Gemini anything... (Ctrl+Enter to send)" : "Ask Gemini anything..."}
            rows={1}
            className="flex-1 bg-transparent resize-none focus:outline-none placeholder-gray-500 text-base leading-relaxed max-h-48 self-center"
            disabled={isLoading}
            onKeyDown={handleKeyDown}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="bg-gray-700 p-3 ml-2 rounded-full hover:bg-gray-600 transition-colors flex-shrink-0 self-center"
              aria-label="Stop generation"
            >
              <X size={20} />
            </button>
          ) : (
            <div className="ml-2 flex-shrink-0 self-center" title={submitButtonTitle}>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="bg-blue-600 p-3 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                aria-label={submitButtonTitle}
              >
                <Send size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
};

export default PromptInput;