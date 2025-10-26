import React, { useState, useRef, useMemo } from 'react';
import { Plus, Send, X, File as FileIcon, LoaderCircle, ImageIcon } from '../../components/icons';
import type { AttachedFile, Mode, ModeId, ChatMessage } from '../../types';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';

// Use a map of direct hex color values to bypass Tailwind's JIT purging for this dynamic element.
const TOKEN_HEX_COLORS = {
  default: '#6b7280', // Equivalent to Tailwind's text-gray-500
  yellow: '#facc15',  // Equivalent to Tailwind's text-yellow-400
  orange: '#fb923c',  // Equivalent to Tailwind's text-orange-400
  red: '#f87171',    // Equivalent to Tailwind's text-red-400
};

const GEMINI_FLASH_LIMIT = 250000;
const GEMINI_PRO_LIMIT = 125000;
const TOKEN_OVERAGE_BUFFER = 1.02; // 102% buffer for token counter inaccuracies

const PromptInput: React.FC = () => {
  const { 
    onSubmit, isLoading, onStop, onFileAddClick,
    selectedMode, setSelectedMode, modes, chatHistory,
    attachedFiles, setAttachedFiles,
    prompt, setPrompt, totalTokens, selectedModel
  } = useChat();
  const { apiKey, sendWithCtrlEnter } = useSettings();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!prompt.trim() && !canResend && attachedFiles.length === 0) return;

    onSubmit(prompt);
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

  const { tokenColor, tokenTooltipText, shouldDisableSubmit } = useMemo(() => {
    let level: keyof typeof TOKEN_HEX_COLORS = 'default';
    let tooltipText = `${totalTokens.toLocaleString()} total input tokens.`;
    let disableSubmit = false;

    if (selectedMode === 'advanced-coder') {
      const advancedCoderThreshold1 = 80000;
      const advancedCoderThreshold2 = 100000;
      const advancedCoderThreshold3 = 118000;

      if (totalTokens * TOKEN_OVERAGE_BUFFER > advancedCoderThreshold3) {
        level = 'red';
        tooltipText = `Input token is larger than the free tier limit.`;
        disableSubmit = true;
      } else if (totalTokens * TOKEN_OVERAGE_BUFFER > advancedCoderThreshold2) {
        level = 'orange';
        tooltipText = `Input token is large, high chance the response will be cancelled.`;
        disableSubmit = false;
      } else if (totalTokens > advancedCoderThreshold1) {
        level = 'yellow';
        tooltipText = `Input token is large, response might be cancelled.`;
      }
    } else {
      const modelLimit = selectedModel === 'gemini-flash-latest' ? GEMINI_FLASH_LIMIT : GEMINI_PRO_LIMIT;
      const defaultSimpleThresholdYellow = 100000;
      const defaultSimpleThresholdOrange = modelLimit * 0.85;

      if (totalTokens * TOKEN_OVERAGE_BUFFER > modelLimit) {
        level = 'red';
        tooltipText = `Input token is potentially larger than the model's context limit.`;
        disableSubmit = true;
      } else if (totalTokens > defaultSimpleThresholdOrange) {
        level = 'orange';
        tooltipText = `Input token is very large, response might be slow or fail.`;
      } else if (totalTokens > defaultSimpleThresholdYellow) {
        level = 'yellow';
        tooltipText = `Input token is large, response might be slow.`;
      }
    }
    
    return { tokenColor: TOKEN_HEX_COLORS[level], tokenTooltipText: tooltipText, shouldDisableSubmit: disableSubmit };
  }, [totalTokens, selectedModel, selectedMode]);

  const isSubmitDisabled = !apiKey || isLoading || (!prompt.trim() && !canResend && attachedFiles.length === 0) || shouldDisableSubmit;
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
  } else if (shouldDisableSubmit) {
      submitButtonTitle = tokenTooltipText;
  }

  const handleRemoveAttachedFile = (fileName: string) => {
    setAttachedFiles(prev => prev.filter(f => f.name !== fileName));
  };


  return (
    <form onSubmit={handleSubmit} className="w-full bg-[#1e1f20] transition-all duration-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/50 flex flex-col">
      <div>
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            {/* Tokens counter now uses inline styles for robust color changes */}
            <div 
              className="text-xs bg-[#1e1f20] px-1 rounded-sm z-10 transition-colors duration-200"
              style={{ color: tokenColor }}
              title={tokenTooltipText}
            >
                {totalTokens.toLocaleString()} tokens
            </div>
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
                className="bg-blue-600 p-3 rounded-full hovear:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
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