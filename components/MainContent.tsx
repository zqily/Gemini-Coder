import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, ChevronDown, Sparkles, User, ImageIcon, File as FileIcon, Menu, Copy, Check } from './icons';
import PromptInput from './PromptInput';
import type { ChatMessage, AttachedFile } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MainContentProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isMobile: boolean;
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
    { id: 'gemini-pro-latest', name: 'Gemini Pro' },
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
          <span className="text-xl md:text-2xl font-medium">{currentModelName}</span>
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
                selectedModel === model.id ? 'bg-blue-600 text-white' : 'text-gray-300'
              } block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors`}
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

const CodeBlock: React.FC<{ language: string; codeString: string }> = ({ language, codeString }) => {
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="relative text-sm my-4 rounded-lg overflow-hidden bg-[#282c34]">
      <div className="flex items-center justify-between text-gray-300 px-4 py-1.5">
        <span className="font-sans text-xs font-semibold">{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-medium hover:text-white transition-colors disabled:opacity-50">
          {isCopied ? <Check size={16} className="text-green-400"/> : <Copy size={16} />}
          <span aria-live="polite">{isCopied ? 'Copied!' : 'Copy code'}</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', backgroundColor: '#1e1e1e' }}
          codeTagProps={{ style: { fontFamily: 'inherit' } }}
        >
          {codeString.replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }: React.ComponentProps<'code'> & { node?: any; inline?: boolean }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children);
          return !inline ? (
            <CodeBlock 
              language={match ? match[1] : ''} 
              codeString={codeString} 
            />
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const textPart = message.parts.find(p => 'text' in p)?.text;
    const fileParts = message.parts.filter(p => 'inlineData' in p);

    return (
        <div className="flex flex-col mb-10 animate-fade-in-up">
            <div className="flex items-center space-x-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600'}`}>
                    {isUser ? <User size={18} /> : <Sparkles size={18} />}
                </div>
                <span className="font-semibold text-white">{isUser ? 'You' : 'Gemini'}</span>
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
                {textPart && <div className="prose prose-invert max-w-none"><MarkdownRenderer content={textPart} /></div>}
             </div>
        </div>
    );
};


const WelcomeScreen: React.FC<{ onExampleClick: (prompt: string) => void }> = ({ onExampleClick }) => {
    const examples = [
        { title: "Debug Python code", prompt: "Can you help me debug this Python code? It's supposed to sort a list of tuples but it's giving a TypeError.\n\n```python\n data = [('apple', 3), ('banana', 1), ('cherry', 2)]\n sorted_data = sorted(data, key=lambda item: item[2])\n print(sorted_data)\n```" },
        { title: "Explain a concept", prompt: "Explain the concept of closures in JavaScript with a simple code example." },
        { title: "Write a function", prompt: "Write a TypeScript function that takes an array of objects and a key, and returns a new array with objects sorted by that key." },
        { title: "Create a regex", prompt: "Create a regex to validate an email address according to common standards." },
    ];
    return (
         <div className="flex flex-col h-full justify-center items-center text-center pb-24">
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 animate-shimmer">
                Hello, how can I help?
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 w-full max-w-2xl">
                {examples.map(ex => (
                    <button key={ex.title} onClick={() => onExampleClick(ex.prompt)} className="bg-[#1e1f20] p-4 rounded-lg text-left hover:bg-[#2a2b2d] transition-all duration-200 transform hover:scale-[1.02]">
                        <p className="font-semibold text-white">{ex.title}</p>
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">{ex.prompt}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

const TypingIndicator = () => (
    <div className="flex items-center space-x-3 mb-10 animate-fade-in-up">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 flex-shrink-0">
            <Sparkles size={18} />
        </div>
        <div className="flex items-center space-x-1.5 p-3 bg-[#1e1f20] rounded-lg">
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
        </div>
    </div>
);

const MainContent: React.FC<MainContentProps> = ({ isMobile, toggleSidebar, chatHistory, isLoading, selectedModel, setSelectedModel, onSubmit }) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const handleExampleSubmit = (prompt: string) => {
    onSubmit(prompt, []);
  };

  useEffect(() => {
    // Scroll to bottom with a slight delay to allow rendering
    setTimeout(() => {
      chatContainerRef.current?.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }, [chatHistory, isLoading]);
  
  return (
    <div className="flex-1 flex flex-col h-screen bg-[#131314]">
      <header className="flex justify-between items-center p-4 h-20 flex-shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
            {isMobile && (
                <button
                    onClick={toggleSidebar}
                    className="p-2 rounded-full hover:bg-gray-700 transition-all"
                    aria-label="Toggle sidebar"
                >
                    <Menu size={24} />
                </button>
            )}
            <ModelSelector selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
        </div>
        <button className="p-2 rounded-full hover:bg-gray-700 transition-all hover:scale-105 active:scale-95" aria-label="Help">
          <HelpCircle size={24} />
        </button>
      </header>

      <main ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 pb-4">
        <div className="max-w-4xl mx-auto h-full">
            {chatHistory.length === 0 && !isLoading ? (
                <WelcomeScreen onExampleClick={handleExampleSubmit} />
            ) : (
                 <div className="pt-8">
                    {chatHistory.map((msg, index) => <ChatBubble key={index} message={msg} />)}
                    {isLoading && chatHistory.length > 0 && <TypingIndicator />}
                 </div>
            )}
        </div>
      </main>
      
      <footer className="px-4 md:px-8 lg:px-16 pb-6 flex-shrink-0 bg-[#131314]">
        <div className="max-w-4xl mx-auto">
          <PromptInput onSubmit={onSubmit} isLoading={isLoading} />
        </div>
      </footer>
    </div>
  );
};

export default MainContent;