import React, { useState, useEffect } from 'react';
import { X, Save, Copy, Check } from './icons';

interface FileEditorModalProps {
  filePath: string;
  initialContent: string;
  onClose: () => void;
  onSave: (path: string, content: string) => void;
}

const FileEditorModal: React.FC<FileEditorModalProps> = ({ filePath, initialContent, onClose, onSave }) => {
  const [content, setContent] = useState(initialContent);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, filePath]);
  
  // ESC to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSave = () => {
    onSave(filePath, content);
    onClose();
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-[#1e1f20] w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-gray-700/50 animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-3 border-b border-gray-700/50 flex-shrink-0">
          <h3 className="font-mono text-sm text-gray-400 truncate" title={filePath}>{filePath}</h3>
          <div className="flex items-center gap-2">
             <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors p-2 rounded-md hover:bg-gray-700 disabled:opacity-50">
                {isCopied ? <Check size={16} className="text-green-400"/> : <Copy size={16} />}
                <span aria-live="polite">{isCopied ? 'Copied!' : 'Copy'}</span>
            </button>
             <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              aria-label="Close editor"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-[#131314] text-gray-300 p-4 resize-none focus:outline-none font-mono text-sm leading-relaxed"
            spellCheck="false"
          />
        </main>

        <footer className="p-3 border-t border-gray-700/50 flex justify-end flex-shrink-0">
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
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
