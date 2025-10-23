import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, ChevronDown, User, ImageIcon, File as FileIcon, Menu, Copy, Check,BrainCircuit, Trash2 } from './icons';
import PromptInput from './PromptInput';
import type { ChatMessage, AttachedFile, Mode, ModeId, ChatPart, FunctionCallPart, FunctionResponsePart, TextPart, InlineDataPart } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import GeminiIcon from './GeminiIcon';
import { ALL_ACCEPTED_MIME_TYPES, CONVERTIBLE_TO_TEXT_MIME_TYPES, fileToDataURL } from '../utils/fileUpload';
import HelpModal from './HelpModal';


interface MainContentProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isMobile: boolean;
  chatHistory: ChatMessage[];
  isLoading: boolean;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  isReadingFiles: boolean;
  setIsReadingFiles: (isReading: boolean) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  selectedMode: ModeId;
  setSelectedMode: (mode: ModeId) => void;
  modes: Record<ModeId, Mode>;
  sendWithCtrlEnter: boolean;
  apiKey: string;
  setApiKey: (key: string) => void;
  onDeleteMessage: (index: number) => void;
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
      code({
        node,
        inline,
        className,
        children,
        ...props
      }: React.ComponentProps<'code'> & { node?: any; inline?: boolean }) {
        // Recursively extract text from children (handles arrays / nested nodes)
        const extractText = (ch: any): string => {
          if (ch == null) return '';
          if (Array.isArray(ch)) return ch.map(extractText).join('');
          if (typeof ch === 'string' || typeof ch === 'number') return String(ch);
          // If it's a React element, try to get its children
          if (typeof ch === 'object' && 'props' in ch) return extractText((ch as any).props?.children);
          return '';
        };
        const raw = extractText(children).replace(/\u200B/g, '');
        const trimmed = raw.trim();
        // Remove ONLY leading/trailing backticks (any count), but keep internal backticks if intentional
        const cleaned = trimmed.replace(/^`+|`+$/g, '');

        // Detect language class e.g. language-js
        const langMatch = /language-(\w+)/.exec(className || '');
        const detectedLanguage = langMatch ? langMatch[1] : '';

        // Block if fenced (language class) or contains newline (multiline)
        const isBlock = Boolean(detectedLanguage) || cleaned.includes('\n');

        if (isBlock) {
          // Remove possible fenced triple-backticks for safety and trim extra newlines
          const blockCode = cleaned.replace(/^```+|```+$/g, '').replace(/^\n+|\n+$/g, '');
          return <CodeBlock language={detectedLanguage} codeString={blockCode} />;
        }

        // Inline styling: orange/yellow text with subtle matching background
        return (
          <code
            className="inline-block align-baseline font-mono text-sm px-1 py-[0.125rem] rounded"
            {...props}
            style={{
              color: '#f6c348', // yellow-orange text
              backgroundColor: 'rgba(246,195,72,0.08)', // subtle matching bg
              border: '1px solid rgba(246,195,72,0.12)',
            }}
          >
            {cleaned}
          </code>
        );
      }
      }}
    >
      {content}
    </ReactMarkdown>
  );
};


interface ChatBubbleProps {
  message: ChatMessage;
  toolResponseMessage?: ChatMessage;
  onDelete: () => void;
}

const isFunctionCallPart = (part: ChatPart): part is FunctionCallPart => 'functionCall' in part;
const isFunctionResponsePart = (part: ChatPart): part is FunctionResponsePart => 'functionResponse' in part;

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, toolResponseMessage, onDelete }) => {
    const isUser = message.role === 'user';
    const isModel = message.role === 'model';
    const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(false);
    
    const rawTextContent = (message.parts.find((p): p is TextPart => 'text' in p))?.text ?? '';
    const fileParts = message.parts.filter((p): p is InlineDataPart => 'inlineData' in p);
    const functionCallParts = message.parts.filter(isFunctionCallPart);
    const functionResponseParts = toolResponseMessage?.parts.filter(isFunctionResponsePart) ?? [];

    let thoughts: string | null = null;
    let mainText = rawTextContent;

    const startTag = '<think>';
    const endTag = '</think>';

    const firstStartTagIndex = rawTextContent.indexOf(startTag);
    const lastEndTagIndex = rawTextContent.lastIndexOf(endTag);
    
    if (firstStartTagIndex !== -1 && lastEndTagIndex !== -1 && firstStartTagIndex < lastEndTagIndex) {
        // Extract thoughts from between the first <think> and the last </think>
        thoughts = rawTextContent.substring(firstStartTagIndex + startTag.length, lastEndTagIndex).trim();
        
        // The main text is everything after the last </think>
        mainText = rawTextContent.substring(lastEndTagIndex + endTag.length).trim();
    }

    const Icon = isUser ? User : GeminiIcon;
    const name = isUser ? 'You' : 'Gemini';

    return (
        <div className="group relative flex flex-col mb-10 animate-fade-in-up">
            <button
                onClick={onDelete}
                className="absolute top-0 right-0 p-1.5 rounded-full text-gray-500 hover:bg-red-500/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete message"
                title="Delete message"
            >
                <Trash2 size={16} />
            </button>
            <div className="flex items-center space-x-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${isUser ? 'bg-blue-600' : ''}`}>
                    <Icon size={isModel ? 28 : 18} />
                </div>
                <span className="font-semibold text-white">{name}</span>
            </div>
             <div className={`ml-11 ${isModel ? 'animate-model-response-entry' : ''}`}>
                {fileParts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {fileParts.map((part, index) => (
                            <div key={index} className="bg-gray-700/50 rounded-lg p-2 flex items-center gap-2 text-sm">
                                {part.inlineData.mimeType.startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                                <span>File Attached ({part.inlineData.mimeType})</span>
                            </div>
                        ))}
                    </div>
                )}
                
                {thoughts && (
                    <div className="mb-4 border border-gray-700/50 rounded-lg animate-fade-in">
                        <button 
                            onClick={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
                            className="w-full flex justify-between items-center p-3 text-left text-sm font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
                            aria-expanded={isThoughtsExpanded}
                        >
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={16} />
                                <span>Expand Thoughts</span>
                            </div>
                            <ChevronDown size={18} className={`transition-transform duration-200 ${isThoughtsExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isThoughtsExpanded && (
                            <div className="p-4 border-t border-gray-700/50 bg-black/20 animate-fade-in-up-short">
                                <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans">
                                    {thoughts}
                                </pre>
                            </div>
                        )}
                    </div>
                )}

                {mainText && <div className="prose prose-invert max-w-none"><MarkdownRenderer content={mainText} /></div>}
                
                {functionCallParts.length > 0 && (
                     <div className="space-y-3">
                        {functionCallParts.map((callPart, index) => {
                            const correspondingResponse = functionResponseParts[index];
                            return (
                                <div key={index} className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden text-sm">
                                    {/* Tool Call Section */}
                                    <div className="p-3">
                                        <p className="font-semibold text-gray-300">Tool Call: <code className="text-blue-400">{callPart.functionCall.name ?? 'unknown'}</code></p>
                                        <pre className="text-xs text-gray-400 mt-1 overflow-x-auto bg-black/20 p-2 rounded-md">
                                            {JSON.stringify(callPart.functionCall.args ?? {}, null, 2)}
                                        </pre>
                                    </div>
                                    {/* Tool Result Section */}
                                    {correspondingResponse && (
                                        <div className="border-t border-gray-700/50 p-3 bg-black/10">
                                            <p className="font-semibold text-gray-300">Tool Result: <code className="text-blue-400">{correspondingResponse.functionResponse.name}</code></p>
                                            <pre className="text-xs text-gray-400 mt-1 overflow-x-auto bg-black/20 p-2 rounded-md">
                                                {JSON.stringify(correspondingResponse.functionResponse.response, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 animate-flow-gradient">
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

const TypingIndicator = ({ message }: { message?: string }) => (
    <div className="flex items-center space-x-3 mb-6 animate-fade-in-up ml-11">
        <div className="flex items-center space-x-2 p-3 bg-transparent rounded-lg">
            <div className="w-3 h-3 bg-blue-500 rounded-full typing-dot"></div>
            <div className="w-3 h-3 bg-purple-500 rounded-full typing-dot"></div>
            <div className="w-3 h-3 bg-blue-400 rounded-full typing-dot"></div>
        </div>
        {message && <div className="text-gray-200">{message}</div>}
    </div>
);

const MainContent: React.FC<MainContentProps> = ({ isMobile, toggleSidebar, chatHistory, isLoading, attachedFiles, setAttachedFiles, isReadingFiles, setIsReadingFiles, selectedModel, setSelectedModel, onSubmit, onStop, selectedMode, setSelectedMode, modes, sendWithCtrlEnter, apiKey, setApiKey, onDeleteMessage }) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
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
      setAttachedFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Error reading files:", error);
    } finally {
      setIsReadingFiles(false);
    }
  }, [setAttachedFiles, setIsReadingFiles]);

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
    onSubmit(prompt);
  };
  
  const handlePromptSubmit = (prompt: string) => {
    onSubmit(prompt);
  };
  
  const lastMessage = chatHistory[chatHistory.length - 1];
  const isLastMessagePlaceholder = isLoading && lastMessage?.role === 'model';
  
  const lastMessageText = isLastMessagePlaceholder 
    ? (lastMessage.parts.find((p): p is TextPart => 'text' in p))?.text ?? '' 
    : '';

  // Heuristic to check if the text is a status update from the retry logic that should be displayed.
  const isDisplayableStatus = lastMessageText.includes('Retrying') 
    || lastMessageText.startsWith('Model is overloaded') 
    || lastMessageText.startsWith('Error:');

  // Messages to render in bubbles. The placeholder is always hidden while loading and represented by the indicator.
  const messagesToRender = isLastMessagePlaceholder ? chatHistory.slice(0, -1) : chatHistory;
  
  // The text to display next to the typing indicator.
  const statusMessageForIndicator = isDisplayableStatus ? lastMessageText : '';
  
  // The typing indicator should be shown whenever the model is thinking.
  const showTypingIndicator = isLoading;

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
        <button onClick={() => setIsHelpModalOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-all hover:scale-105 active:scale-95" aria-label="Help">
          <HelpCircle size={24} />
        </button>
      </header>

      <main ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 pb-4">
        <div className="max-w-4xl mx-auto h-full">
            {messagesToRender.length === 0 && !isLoading ? (
                <WelcomeScreen onExampleClick={handleExampleSubmit} />
            ) : (
                 <div className="pt-8 pb-[40vh]">
                    {messagesToRender.map((msg, index) => {
                        if (msg.role === 'tool') {
                            return null;
                        }

                        const originalIndex = chatHistory.indexOf(msg);

                        const nextMessage = (originalIndex > -1 && originalIndex + 1 < chatHistory.length)
                            ? chatHistory[originalIndex + 1]
                            : undefined;

                        const toolResponseMessage = (
                            msg.role === 'model' &&
                            nextMessage?.role === 'tool' &&
                            msg.parts.some(part => 'functionCall' in part)
                        ) ? nextMessage : undefined;
                        
                        const handleDelete = () => {
                            if (originalIndex > -1) {
                                onDeleteMessage(originalIndex);
                            }
                        };

                        return <ChatBubble key={originalIndex > -1 ? originalIndex : index} message={msg} toolResponseMessage={toolResponseMessage} onDelete={handleDelete} />;
                    })}
                    {showTypingIndicator && <TypingIndicator message={statusMessageForIndicator} />}
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
            files={attachedFiles}
            setFiles={setAttachedFiles}
            selectedMode={selectedMode}
            setSelectedMode={setSelectedMode}
            modes={modes}
            sendWithCtrlEnter={sendWithCtrlEnter}
            apiKey={apiKey}
            selectedModel={selectedModel}
            chatHistory={chatHistory}
           />
        </div>
      </footer>
      <HelpModal 
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />
    </div>
  );
};

export default MainContent;