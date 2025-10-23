import React, { useState, useRef } from 'react';
import { Plus, Send, X, File as FileIcon, LoaderCircle } from './icons';
import type { AttachedFile, Mode, ModeId } from '../types';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from '../utils/fileUpload';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  onStop: () => void;
  files: AttachedFile[];
  setFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  selectedMode: ModeId;
  setSelectedMode: (mode: ModeId) => void;
  modes: Record<ModeId, Mode>;
  sendWithCtrlEnter: boolean;
  apiKey: string;
  selectedModel: string;
}

const FilePreview: React.FC<{ file: AttachedFile, onRemove: () => void }> = ({ file, onRemove }) => {
    const isImage = file.type.startsWith('image/');
    const extension = file.name.split('.').pop()?.toUpperCase();

    return (
        <div className="relative group w-24 h-24 bg-gray-800 rounded-lg overflow-hidden animate-fade-in-up" title={file.name}>
            {isImage ? (
                <img src={file.content} alt={file.name} className="w-full h-full object-cover" />
            ) : (
                <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                    <FileIcon size={28} className="text-gray-400" />
                    <p className="text-xs text-gray-400 mt-1.5 w-full truncate">{file.name}</p>
                    {extension && <span className="text-[10px] font-bold text-gray-500">{extension}</span>}
                </div>
            )}
             <button
                type="button"
                onClick={onRemove}
                className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${file.name}`}
            >
                <X size={14} />
            </button>
        </div>
    );
};

const PromptInput: React.FC<PromptInputProps> = ({ onSubmit, isLoading, onStop, files, setFiles, selectedMode, setSelectedMode, modes, sendWithCtrlEnter, apiKey, selectedModel }) => {
  const [prompt, setPrompt] = useState('');
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    setIsReadingFiles(true);
    try {
      const newFilesPromises = selectedFiles
        .filter(file => ALL_ACCEPTED_MIME_TYPES.includes(file.type))
        .map(async file => {
          const content = await fileToDataURL(file);
          const mimeType = CONVERTIBLE_TO_TEXT_MIME_TYPES[file.type] || file.type;
          return {
            name: file.name,
            type: mimeType,
            size: file.size,
            content,
          };
        });

      const newFiles = await Promise.all(newFilesPromises);
      setFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Error reading files:", error);
    } finally {
      setIsReadingFiles(false);
      if (event.target) event.target.value = '';
    }
  };
  
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
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
    if (isLoading || isReadingFiles || (!prompt.trim() && files.length === 0)) return;
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
  
  const isSubmitDisabled = !apiKey || !selectedModel || isReadingFiles || (!prompt.trim() && files.length === 0);
  let submitButtonTitle = "Send prompt";
  if (!apiKey) {
      submitButtonTitle = "Please set your API key in settings";
  } else if (!selectedModel) {
      submitButtonTitle = "Please select a model";
  } else if (isReadingFiles) {
      submitButtonTitle = "Processing files...";
  } else if (!prompt.trim() && files.length === 0) {
      submitButtonTitle = "Enter a prompt or attach a file";
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full bg-[#1e1f20] transition-all duration-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/50 flex flex-col ${files.length > 0 ? 'shadow-lg' : ''}`}>
      {files.length > 0 && (
        <div className="p-3 border-b border-gray-700/50">
            <div className="flex flex-wrap gap-3">
             {files.map((file, index) => (
                <FilePreview key={index} file={file} onRemove={() => removeFile(index)} />
              ))}
            </div>
        </div>
      )}
      <div>
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            {Object.values(modes).map(mode => (
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

        <div className="p-2 flex items-end w-full relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isReadingFiles}
            className="p-2 mr-1 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0 self-center"
            aria-label="Attach files"
          >
          {isReadingFiles ? <LoaderCircle className="animate-spin" size={24} /> : <Plus size={24} />}
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept={ALL_ACCEPTED_MIME_TYPES.join(',')}
          />
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