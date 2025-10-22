
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, ChevronDown, User, ImageIcon, File as FileIcon, Menu, Copy, Check, X, Wrench } from './icons';
import PromptInput from './PromptInput';
// FIX: Import TextPart and InlineDataPart for use in type guards.
import type { ChatMessage, AttachedFile, Mode, ModeId, ChatPart, FunctionCallPart, FunctionResponsePart, TextPart, InlineDataPart } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import GeminiIcon from './GeminiIcon';

// File handling utilities

const NATIVELY_SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/x-javascript',
  'text/x-typescript', 'application/x-typescript', 'text/csv', 'text/markdown',
  'text/x-python', 'application/x-python-code', 'application/json', 'text/xml', 'application/rtf',
  'application/pdf'
];

// A map of text-based MIME types to convert to 'text/plain' for wider compatibility
const CONVERTIBLE_TO_TEXT_MIME_TYPES: Record<string, string> = {
    'image/svg+xml': 'text/plain',
    'application/x-sh': 'text/plain',
    'text/x-c': 'text/plain',
    'text/x-csharp': 'text/plain',
    'text/x-c++': 'text/plain',
    'text/x-java-source': 'text/plain',
    'text/x-php': 'text/plain',
    'text/x-ruby': 'text/plain',
    'text/x-go': 'text/plain',
    'text/rust': 'text/plain',
    'application/toml': 'text/plain',
    'text/yaml': 'text/plain',
};

const ALL_ACCEPTED_MIME_TYPES = [...NATIVELY_SUPPORTED_MIME_TYPES, ...Object.keys(CONVERTIBLE_TO_TEXT_MIME_TYPES)];

const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

interface MainContentProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isMobile: boolean;
  chatHistory: ChatMessage[];
  isLoading: boolean;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  onSubmit: (prompt: string, files: AttachedFile[]) => void;
  onStop: () => void;
  selectedMode: ModeId;
  setSelectedMode: (mode: ModeId) => void;
  modes: Record<ModeId, Mode>;
}

const ModelSelector: React.FC<{ selectedModel: string; setSelectedModel: (model: string) => void }> = ({ selectedModel, setSelectedModel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const models = [
    { id: 'gemini-2.5-pro', name: 'Gemini Pro' },
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

const isFunctionCallPart = (part: ChatPart): part is FunctionCallPart => 'functionCall' in part;
const isFunctionResponsePart = (part: ChatPart): part is FunctionResponsePart => 'functionResponse' in part;

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const isModel = message.role === 'model';
    const isTool = message.role === 'tool';

    // FIX: Use explicit type guards to correctly narrow the type of ChatPart and allow safe property access.
    const textPart = (message.parts.find((p): p is TextPart => 'text' in p))?.text;
    const fileParts = message.parts.filter((p): p is InlineDataPart => 'inlineData' in p);
    const functionCallParts = message.parts.filter(isFunctionCallPart);
    const functionResponseParts = message.parts.filter(isFunctionResponsePart);

    const Icon = isUser ? User : isTool ? Wrench : GeminiIcon;
    const name = isUser ? 'You' : isTool ? 'Tool' : 'Gemini';

    return (
        <div className="flex flex-col mb-10 animate-fade-in-up">
            <div className="flex items-center space-x-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${isUser ? 'bg-blue-600' : isTool ? 'bg-gray-600' : ''}`}>
                    <Icon size={isModel ? 28 : 18} />
                </div>
                <span className="font-semibold text-white">{name}</span>
            </div>
             <div className="ml-11">
                {fileParts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {fileParts.map((part, index) => (
                            <div key={index} className="bg-gray-700/50 rounded-lg p-2 flex items-center gap-2 text-sm">
                                {/* FIX: 'part' is now correctly typed as InlineDataPart, so 'inlineData' can be accessed safely. */}
                                {part.inlineData.mimeType.startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                                <span>File Attached ({part.inlineData.mimeType})</span>
                            </div>
                        ))}
                    </div>
                )}
                {textPart && <div className="prose prose-invert max-w-none"><MarkdownRenderer content={textPart} /></div>}
                {functionCallParts.length > 0 && (
                     <div className="space-y-2">
                        {functionCallParts.map((part, index) => (
                             <div key={index} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-sm">
                                {/* FIX: Handle optional 'name' and 'args' properties from FunctionCallPart. */}
                                <p className="font-semibold text-gray-300">Tool Call: <code className="text-blue-400">{part.functionCall.name ?? ''}</code></p>
                                <pre className="text-xs text-gray-400 mt-1 overflow-x-auto bg-black/20 p-2 rounded-md">
                                    {JSON.stringify(part.functionCall.args ?? {}, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
                 {functionResponseParts.length > 0 && (
                     <div className="space-y-2">
                        {functionResponseParts.map((part, index) => (
                             <div key={index} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-3 text-sm">
                                <p className="font-semibold text-gray-300">Tool Result: <code className="text-blue-400">{part.functionResponse.name}</code></p>
                                <pre className="text-xs text-gray-400 mt-1 overflow-x-auto bg-black/20 p-2 rounded-md">
                                    {JSON.stringify(part.functionResponse.response, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
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
            <img src="/assets/gemini.svg" alt="Gemini Logo" className="w-20 h-20 mb-6" />
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
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
            <GeminiIcon size={28} />
        </div>
        <div className="flex items-center space-x-1.5 p-3 bg-[#1e1f20] rounded-lg">
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
        </div>
    </div>
);

const MainContent: React.FC<MainContentProps> = ({ isMobile, toggleSidebar, chatHistory, isLoading, selectedModel, setSelectedModel, onSubmit, onStop, selectedMode, setSelectedMode, modes }) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  
  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsReadingFiles(true);
    try {
      const newFilesPromises = Array.from(selectedFiles)
        .filter(file => ALL_ACCEPTED_MIME_TYPES.includes(file.type))
        .map(async file => {
          const content = await fileToDataURL(file);
          // Convert mime type if it's in our convertible list, otherwise use original
          const mimeType = CONVERTIBLE_TO_TEXT_MIME_TYPES[file.type] || file.type;
          return { name: file.name, type: mimeType, size: file.size, content };
        });
      const newFiles = await Promise.all(newFilesPromises);
      setFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Error reading files:", error);
    } finally {
      setIsReadingFiles(false);
    }
  }, []);

  useEffect(() => {
    let dragOverTimeout: number | undefined;

    const hideOverlay = () => {
      setIsDragging(false);
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // When re-entering, clear any lingering timeout to hide the overlay.
      clearTimeout(dragOverTimeout);
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsDragging(true);
      }
    };
    
    // Fires continuously while dragging over the window.
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // We're still dragging over, so reset the timeout.
      clearTimeout(dragOverTimeout);
      // If dragover stops firing (e.g., user moves cursor out of window), the timeout will hide the overlay.
      dragOverTimeout = window.setTimeout(hideOverlay, 150);
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // A drop is a definitive end, so clear the timeout and hide the overlay.
      clearTimeout(dragOverTimeout);
      hideOverlay();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    };

    // Note: We don't need 'dragleave' because the 'dragover' timeout handles leaving the window.
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      clearTimeout(dragOverTimeout);
    };
  }, [handleFileSelect]);

  const handleExampleSubmit = (prompt: string) => {
    onSubmit(prompt, []);
  };
  
  const handlePromptSubmit = (prompt: string) => {
    onSubmit(prompt, files);
    setFiles([]);
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
    <div className="relative flex-1 flex flex-col h-screen bg-[#131314]">
      {isDragging && (
        <div className="absolute inset-0 bg-blue-900/40 border-2 border-dashed border-blue-400 rounded-2xl z-50 flex items-center justify-center pointer-events-none animate-fade-in m-2">
          <div className="text-center text-white p-6 bg-black/60 rounded-xl backdrop-blur-sm">
            <ImageIcon size={48} className="mx-auto mb-3 text-blue-300" />
            <p className="text-xl font-bold">Drop files to attach</p>
            <p className="text-sm text-gray-300">Images, text, code, PDFs and more</p>
          </div>
        </div>
      )}
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
                    {isLoading && <TypingIndicator />}
                 </div>
            )}
        </div>
      </main>
      
      <footer className="px-4 md:px-8 lg:px-16 pb-6 flex-shrink-0 bg-[#131314]">
        <div className="max-w-4xl mx-auto">
          <PromptInput
            onSubmit={handlePromptSubmit}
            isLoading={isLoading || isReadingFiles}
            onStop={onStop}
            files={files}
            setFiles={setFiles}
            selectedMode={selectedMode}
            setSelectedMode={setSelectedMode}
            modes={modes}
           />
        </div>
      </footer>
    </div>
  );
};

export default MainContent;
