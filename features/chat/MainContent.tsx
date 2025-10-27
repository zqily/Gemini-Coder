import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, ChevronDown, User, ImageIcon, File as FileIcon, Menu, Copy, Check, Trash2 } from '../../components/Icons';
import PromptInput from './PromptInput';
import type { ChatMessage, ChatPart, FunctionCallPart, FunctionResponsePart, TextPart, InlineDataPart, Mode, ModeId } from '../../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import GeminiIcon from '../../components/GeminiIcon';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';
import { useFileSystem } from '../file-system/FileSystemContext';
import AdvancedCoderProgress from './AdvancedCoderProgress';


interface MainContentProps {
  toggleSidebar: () => void;
  isMobile: boolean;
}

const ModelSelector: React.FC<{ 
  disabled: boolean;
}> = ({ disabled }) => {
  const { selectedModel, setSelectedModel } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const models = [
    { id: 'gemini-2.5-pro', name: 'Gemini Pro' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash' },
  ];

  const currentModelName = models.find(m => m.id === selectedModel)?.name || 'Select Model';
  const buttonText = disabled ? "Controlled by Mode" : currentModelName;


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
    <div 
      className="relative inline-block text-left" 
      ref={dropdownRef} 
      title={disabled ? "Model selection is controlled by Advanced Coder mode" : ""}
    >
      <div>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`flex items-center space-x-1 transition-colors ${ 
            disabled 
              ? 'text-gray-500 cursor-not-allowed' 
              : 'text-gray-300 hover:text-white'
          }`}
          disabled={disabled}
          aria-disabled={disabled}
        >
          <span className="text-xl md:text-2xl font-medium">{buttonText}</span>
          <ChevronDown size={24} className={`transition-transform duration-200 text-gray-400 ${isOpen && !disabled ? 'rotate-180' : ''} ${disabled ? 'opacity-50' : ''}`} />
        </button>
      </div>

      {!disabled && (
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
      )}
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
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');

          if (match) {
            return (
              <CodeBlock
                language={match[1]}
                codeString={codeString}
              />
            );
          }

          return (
            <code
              className="inline-block align-baseline font-mono text-sm px-1 py-[0.125rem] rounded"
              {...props}
              style={{
                color: '#f6c348',
                backgroundColor: 'rgba(246,195,72,0.08)',
                border: '1px solid rgba(246,195,72,0.12)',
              }}
            >
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


interface ChatBubbleProps {
  message: ChatMessage;
  toolResponseMessage?: ChatMessage;
  onDelete: () => void;
  modes: Record<ModeId, Mode>;
}

const isFunctionCallPart = (part: ChatPart): part is FunctionCallPart => 'functionCall' in part;
const isFunctionResponsePart = (part: ChatPart): part is FunctionResponsePart => 'functionResponse' in part;

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, toolResponseMessage, onDelete, modes }) => {
    const isUser = message.role === 'user';
    const isModel = message.role === 'model';
    
    const rawTextContent = (message.parts.find((p): p is TextPart => 'text' in p))?.text ?? '';
    const fileParts = message.parts.filter((p): p is InlineDataPart => 'inlineData' in p);
    const functionCallParts = message.parts.filter(isFunctionCallPart);
    const functionResponseParts = toolResponseMessage?.parts.filter(isFunctionResponsePart) ?? [];

    const mainText = rawTextContent;

    const Icon = isUser ? User : GeminiIcon;
    
    let name = 'You';
    if (isModel) {
        const modeId = message.mode || 'default';
        if (modeId === 'default') {
            name = 'Gemini';
        } else {
            name = modes[modeId]?.name || 'Gemini';
        }
    }

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
                
                {mainText && <div className="prose prose-invert max-w-none"><MarkdownRenderer content={mainText} /></div>}
                
                {functionCallParts.length > 0 && (
                     <div className="space-y-3">
                        {functionCallParts.map((callPart, index) => {
                            const correspondingResponse = functionResponseParts[index];
                            const responseData = correspondingResponse?.functionResponse?.response;
                            const isSuccess = responseData?.success === true;
                            const errorMessage = responseData?.error;
                            const functionName = callPart.functionCall.name ?? 'unknown';
                            const argsJson = JSON.stringify(callPart.functionCall.args ?? {}, null, 2);
 
                            return (
                                <div key={index} className={`rounded-lg overflow-hidden text-sm animate-fade-in-up-short ${correspondingResponse
                                  ? (isSuccess ? 'bg-green-900/40 border border-green-700/50' : 'bg-red-900/40 border border-red-700/50')
                                  : 'bg-gray-800/50 border border-gray-700/50'
                                  }`}>
                                    <div className="p-3">
                                        <p className={`font-semibold ${correspondingResponse && !isSuccess ? 'text-red-300' : 'text-gray-300'}`}>
                                            <span className="font-normal text-gray-400">Tool Call: </span>
                                            <code className={`font-mono ${!correspondingResponse ? 'text-blue-300' :
                                                isSuccess ? 'text-green-300' : 'text-red-300'
                                                }`}>
                                                {functionName}
                                            </code>
                                            {correspondingResponse && (
                                                <span className={`font-normal text-xs pl-2 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                                                    ({isSuccess ? 'Success' : 'Failed'})
                                                </span>
                                            )}
                                        </p>
 
                                        <details className="mt-2" open={!isSuccess}>
                                            <summary className="list-none flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-white transition-colors">
                                                <ChevronDown size={14} className="details-arrow flex-shrink-0" />
                                                {`Arguments (${Object.keys(callPart.functionCall.args ?? {}).length})`}
                                            </summary>
                                            <pre className="text-xs text-gray-400 mt-1 overflow-x-auto bg-black/20 p-2 rounded-md font-mono">
                                                {argsJson}
                                            </pre>
                                        </details>
 
                                        {!isSuccess && errorMessage && (
                                            <div className="mt-3 p-2 bg-red-900/40 text-red-300 border-l-4 border-red-500 rounded-r-md">
                                                <p className="font-medium text-xs">Execution Error:</p>
                                                <pre className="text-xs mt-1 whitespace-pre-wrap font-mono">{errorMessage}</pre>
                                            </div>
                                        )}
                                    </div>
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
         <div className="flex flex-col h-full justify-center items-center text-center pb-16 lg:pb-24">
            <img src="/assets/gemini.svg" alt="Gemini Logo" className="w-16 h-16 lg:w-20 lg:h-20 mb-4 lg:mb-6" />
            <h1 className="text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 animate-flow-gradient">
                Hello, how can I help?
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 lg:mt-12 w-full max-w-2xl">
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

const MainContent: React.FC<MainContentProps> = ({ isMobile, toggleSidebar }) => {
  const { 
    chatHistory, isLoading, onSubmit, onDeleteMessage,
    selectedMode, advancedCoderState, modes,
  } = useChat();
  const { setIsHelpModalOpen } = useSettings(); // Use setIsHelpModalOpen from SettingsContext

  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const handleExampleSubmit = (prompt: string) => {
    onSubmit(prompt);
  };
  
  const lastMessage = chatHistory[chatHistory.length - 1];
  const lastMessageIsModel = lastMessage?.role === 'model';
  
  const lastMessageText = lastMessageIsModel
    ? (lastMessage.parts.find((p): p is TextPart => 'text' in p))?.text ?? ''
    : '';

  const isStatusUpdate = lastMessageIsModel && (
    lastMessageText.includes('Retrying') ||
    lastMessageText.startsWith('Model is overloaded') ||
    lastMessageText.startsWith('Error:')
  );

  const isLastMessageAPlaceholder = isLoading && lastMessageIsModel && (!lastMessageText.trim() || isStatusUpdate);
  const messagesToRender = isLastMessageAPlaceholder ? chatHistory.slice(0, -1) : chatHistory;
  const statusMessageForIndicator = isStatusUpdate ? lastMessageText : '';
  
  const showAdvancedCoderProgress = isLoading && selectedMode === 'advanced-coder' && advancedCoderState;
  const showTypingIndicator = isLoading && !showAdvancedCoderProgress;
  
  return (
    <div className="relative flex-1 flex flex-col h-screen bg-[#131314]">
      <header className="sticky top-0 z-20 flex justify-between items-center p-4 h-20 flex-shrink-0 border-b border-gray-800 bg-[#131314]/90 backdrop-blur-sm">
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
            <ModelSelector 
              disabled={selectedMode === 'advanced-coder'}
            />
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
                 <div className="pt-8 pb-8">
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

                        return <ChatBubble key={originalIndex > -1 ? originalIndex : index} message={msg} toolResponseMessage={toolResponseMessage} onDelete={handleDelete} modes={modes} />;
                    })}
                    {showAdvancedCoderProgress && <AdvancedCoderProgress state={advancedCoderState} />}
                    {showTypingIndicator && <TypingIndicator message={statusMessageForIndicator} />}
                 </div>
            )}
        </div>
      </main>
      
      <footer className="sticky bottom-0 px-4 md:px-8 lg:px-16 pb-6 pt-4 flex-shrink-0 bg-gradient-to-t from-[#131314] via-[#131314]/95 to-transparent z-10">
        <div className="max-w-4xl mx-auto">
          <PromptInput />
        </div>
      </footer>
    </div>
  );
};

export default MainContent;
