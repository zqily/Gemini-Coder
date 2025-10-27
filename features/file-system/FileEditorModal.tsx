import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Copy, Check } from '../../components/icons';
import { useFileSystem } from './FileSystemContext';
import { useChat } from '../chat/ChatContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Determines the language for syntax highlighting based on a file's path.
 * @param path The file path (e.g., 'src/components/Button.tsx').
 * @returns A language string compatible with react-syntax-highlighter, or 'text' as a fallback.
 */
const getLanguageFromPath = (path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    if (!extension) return 'text';

    const langMap: { [key: string]: string } = {
        js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
        py: 'python', rb: 'ruby', php: 'php', java: 'java', cs: 'csharp',
        c: 'c', cpp: 'cpp', go: 'go', rs: 'rust', kt: 'kotlin', swift: 'swift',
        html: 'markup', xml: 'markup', svg: 'markup',
        css: 'css', scss: 'scss', less: 'less',
        json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
        md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
        sql: 'sql', graphql: 'graphql', dockerfile: 'docker',
    };

    return langMap[extension] || 'text';
};


const FileEditorModal: React.FC = () => {
  const { editingFile, saveFile, handleCloseFileEditor: closeEditor } = useFileSystem();
  const { isLoading: isChatLoading } = useChat();

  const [content, setContent] = useState(editingFile?.content || '');
  const [isCopied, setIsCopied] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  // Refs for scroll synchronization between the visible highlighter and the invisible textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlighterContainerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      closeEditor();
      setIsClosing(false); // Reset for next time
    }, 200); // Animation duration
  }, [closeEditor]);

  useEffect(() => {
    setContent(editingFile?.content || '');
  }, [editingFile]);
  
  // ESC to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    if (editingFile) {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingFile, handleClose]);

  const handleSave = () => {
    if (editingFile) {
      saveFile(editingFile.path, content);
    }
    handleClose();
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  if (!editingFile) return null;

  const language = getLanguageFromPath(editingFile.path);
  
  const handleScroll = () => {
    if (textareaRef.current && highlighterContainerRef.current) {
      highlighterContainerRef.current.scrollTop = textareaRef.current.scrollTop;
      highlighterContainerRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Shared styles for textarea and code block to ensure they align perfectly.
  const editorStyles: React.CSSProperties = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      padding: '1rem',
      whiteSpace: 'pre',
      wordWrap: 'normal',
      overflowWrap: 'normal',
      boxSizing: 'border-box',
  };

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={handleClose}>
      <div 
        className={`bg-[#1e1f20] w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-gray-700/50 ${isClosing ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-gray-700/50 flex-shrink-0 bg-[#1e1f20] rounded-t-xl">
          <h3 className="font-mono text-sm text-gray-400 truncate" title={editingFile.path}>{editingFile.path}</h3>
          <div className="flex items-center gap-2">
             <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors p-2 rounded-md hover:bg-gray-700 disabled:opacity-50">
                {isCopied ? <Check size={16} className="text-green-400"/> : <Copy size={16} />}
                <span aria-live="polite">{isCopied ? 'Copied!' : 'Copy'}</span>
            </button>
             <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              aria-label="Close editor"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          <div
            ref={highlighterContainerRef}
            className="w-full h-full overflow-auto custom-scrollbar"
            aria-hidden="true" // Hide from screen readers as textarea is the source of truth
          >
            <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                    ...editorStyles,
                    margin: 0,
                    backgroundColor: '#131314',
                    // Ensure the highlighter can grow to fit content
                    minHeight: '100%',
                    minWidth: '100%',
                    display: 'inline-block', // Important for width calculation with long lines
                }}
                codeTagProps={{ style: { ...editorStyles, fontFamily: 'inherit' } }}
            >
                {/* Adding a newline ensures last line is rendered and scrollbar appears correctly */}
                {content + '\n'}
            </SyntaxHighlighter>
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onScroll={handleScroll}
            readOnly={isChatLoading}
            disabled={isChatLoading}
            className="absolute top-0 left-0 w-full h-full bg-transparent text-transparent caret-white resize-none focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed custom-scrollbar"
            style={{
                ...editorStyles,
                WebkitTextFillColor: 'transparent', // Make text invisible in Safari
                overflow: 'auto', // Important for scroll events to fire
            }}
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
          />
        </main>

        <footer className="p-3 border-t border-gray-700/50 flex justify-end flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={isChatLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            <Save size={16} className="inline-block mr-2" />
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FileEditorModal;