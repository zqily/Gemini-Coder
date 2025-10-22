import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, ChevronDown, Sparkles, LoaderCircle, ImageIcon, File as FileIcon } from './icons';
import PromptInput from './PromptInput';
import type { ChatMessage, AttachedFile } from '../types';
import ReactMarkdown from 'react-markdown';

interface MainContentProps {
  isSidebarOpen: boolean;
  chatHistory: ChatMessage[];
  isLoading: boolean;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
}

const ModelSelector: React.FC<{ selectedModel: string; setSelectedModel: (model: string) => void }> = ({ selectedModel, setSelectedModel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const models = [
    { id: 'gemini-1.5-pro-latest', name: 'Gemini Pro' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash' },
  ];

  const currentModelName = models.find(m => m.id === selectedModel)?.name || 'Select Model';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-1 text-gray-300 hover:text-white transition-colors"
        >
          <span className="text-2xl font-medium">{currentModelName}</span>
          <ChevronDown size={24} className={`transition-transform duration-200 text-gray-400 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className={`origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-[#2c2d2f] ring-1 ring-black ring-opacity-5 z-10 transition-all duration-200 ease-out ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
          {models.map(model => (
            <button
              key={model.id}
              onClick={() => {
                setSelectedModel(model.id);
                setIsOpen(false);
              }}
              className={`${
                selectedModel === model.id ? 'bg-gray-700 text-white' : 'text-gray-300'
              } block w-full text-left px-4 py-2 text-sm hover:bg-gray-600 transition-colors`}
              role="menuitem"
            >
              {model.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const textPart = message.parts.find(p => p.text)?.text;
    const fileParts = message.parts.filter(p => p.inlineData);

    return (
        <div className="flex flex-col mb-6 animate-fade-in-up">
            <div className="flex items-center space-x-3 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${isUser ? 'bg-blue-500' : 'bg-gradient-to-br from-purple-500 to-indigo-600'}`}>
                    {isUser ? 'U' : <Sparkles size={18} />}
                </div>
            </div>
             <div className="ml-11">
                {fileParts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {fileParts.map((part, index) => (
                            <div key={index} className="bg-gray-700/50 rounded-lg p-2 flex items-center gap-2 text-sm">
                                {part.inlineData?.mimeType.startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                                <span>File Attached ({part.inlineData?.mimeType})</span>
                            </div>
                        ))}
                    </div>
                )}
                {textPart && <div className="prose prose-invert max-w-none"><ReactMarkdown>{textPart}</ReactMarkdown></div>}
             </div>
        </div>
    );
};


const MainContent: React.FC<MainContentProps> = ({ chatHistory, isLoading, selectedModel, setSelectedModel, onSubmit }) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      chatContainerRef.current?.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }, [chatHistory, isLoading]);
  
  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="flex justify-between items-center p-4 h-20 flex-shrink-0">
        <ModelSelector selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
        <button className="p-2 rounded-full hover:bg-gray-700 transition-all hover:scale-105 active:scale-95">
          <HelpCircle size={24} />
        </button>
      </header>

      <main ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 pb-4">
        <div className="max-w-4xl mx-auto h-full">
            {chatHistory.length === 0 && !isLoading ? (
                <div className="flex flex-col h-full justify-center items-center text-center pb-24">
                    <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 animate-shimmer">
                    Ready to code?
                    </h2>
                    <p className="text-gray-400 mt-4 max-w-md">
                        I can help you write, debug, and learn about code. Try asking me something or uploading a file!
                    </p>
                </div>
            ) : (
                 <div className="pt-8">
                    {chatHistory.map((msg, index) => <ChatBubble key={index} message={msg} />)}
                    {isLoading && (
                        <div className="flex items-center space-x-3 animate-fade-in-up mt-6">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600">
                                <Sparkles size={18} />
                            </div>
                            <LoaderCircle className="animate-spin" size={24} />
                        </div>
                    )}
                 </div>
            )}
        </div>
      </main>
      
      <footer className="px-4 md:px-8 lg:px-16 pb-6 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <PromptInput onSubmit={onSubmit} isLoading={isLoading} />
        </div>
      </footer>
    </div>
  );
};

export default MainContent;