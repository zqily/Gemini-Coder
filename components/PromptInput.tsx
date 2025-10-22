import React, { useState, useRef } from 'react';
import { Plus, Send, X, File as FileIcon, ImageIcon, LoaderCircle } from './icons';
import type { AttachedFile } from '../types';

interface PromptInputProps {
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
  isLoading: boolean;
}

const SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/x-javascript',
  'text/x-typescript', 'application/x-typescript', 'text/csv', 'text/markdown',
  'text/x-python', 'application/x-python-code', 'application/json', 'text/xml', 'application/rtf',
  'application/pdf'
];

const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

const PromptInput: React.FC<PromptInputProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    setIsReadingFiles(true);
    try {
      const newFilesPromises = selectedFiles
        .filter(file => SUPPORTED_MIME_TYPES.includes(file.type))
        .map(async file => {
          const content = await fileToDataURL(file);
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            content,
          };
        });

      const newFiles = await Promise.all(newFilesPromises);
      setFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Error reading files:", error);
      alert("There was an error processing some of your files.");
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
        const maxHeight = 192; // max-h-48 in pixels
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isReadingFiles || (!prompt.trim() && files.length === 0)) return;
    onSubmit(prompt, files);
    setPrompt('');
    setFiles([]);
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {files.map((file, index) => (
            <div key={index} className="bg-gray-700/80 rounded-full pl-3 pr-2 py-1 flex items-center gap-2 text-sm max-w-xs animate-fade-in-up">
              {file.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => removeFile(index)} className="rounded-full hover:bg-gray-600 p-0.5">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="bg-[#1e1f20] rounded-2xl p-2.5 flex items-end w-full relative transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/50">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isReadingFiles}
          className="p-2 mr-1 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
        >
         {isReadingFiles ? <LoaderCircle className="animate-spin" size={24} /> : <Plus size={24} />}
        </button>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept={SUPPORTED_MIME_TYPES.join(',')}
        />
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleTextareaInput}
          placeholder="Ask Gemini"
          rows={1}
          className="flex-1 bg-transparent resize-none focus:outline-none placeholder-gray-500 text-base leading-relaxed max-h-48 self-center"
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={isLoading || isReadingFiles || (!prompt.trim() && files.length === 0)}
          className="bg-[#292a2c] p-3 ml-2 rounded-full hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {isLoading ? <LoaderCircle className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </div>
    </form>
  );
};

export default PromptInput;