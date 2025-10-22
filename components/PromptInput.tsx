import React, { useState, useRef } from 'react';
import { Plus, Send, X, File as FileIcon, LoaderCircle } from './icons';
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
    <form onSubmit={handleSubmit} className={`w-full bg-[#1e1f20] transition-all duration-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/50 ${files.length > 0 ? 'shadow-lg' : ''}`}>
      {files.length > 0 && (
        <div className="p-3 border-b border-gray-700/50">
            <div className="flex flex-wrap gap-3">
             {files.map((file, index) => (
                <FilePreview key={index} file={file} onRemove={() => removeFile(index)} />
              ))}
            </div>
        </div>
      )}
      <div className="p-2 flex items-end w-full relative">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isReadingFiles}
          className="p-2 mr-1 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
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
          accept={SUPPORTED_MIME_TYPES.join(',')}
        />
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleTextareaInput}
          placeholder="Ask Gemini anything..."
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
          className="bg-blue-600 p-3 ml-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 disabled:bg-gray-600"
          aria-label="Send prompt"
        >
          {isLoading ? <LoaderCircle className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </div>
    </form>
  );
};

export default PromptInput;