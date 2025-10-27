import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFileSystem } from './FileSystemContext';
import { X, Search, Folder, FileText } from '../../components/icons';

interface SearchResult {
  path: string;
  type: 'file' | 'folder';
  name: string;
  parentPath: string;
}

interface FileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FileSearchModal: React.FC<FileSearchModalProps> = ({ isOpen, onClose }) => {
  const { displayContext, onOpenFileEditor, setExpandedFolders } = useFileSystem();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const allSearchableItems = useMemo((): SearchResult[] => {
    if (!displayContext) return [];
    
    const items: SearchResult[] = [];
    
    for (const path of displayContext.files.keys()) {
        const parts = path.split('/');
        const name = parts.pop() || '';
        const parentPath = parts.join('/');
        items.push({ path, type: 'file', name, parentPath });
    }
    for (const path of displayContext.dirs) {
        const parts = path.split('/');
        const name = parts.pop() || '';
        const parentPath = parts.join('/');
        items.push({ path, type: 'folder', name, parentPath });
    }
    
    return items.sort((a, b) => a.path.localeCompare(b.path));
  }, [displayContext]);

  useEffect(() => {
    if (isOpen) {
      // Delay focus to allow for modal transition
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    } else {
      // Reset state on close
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const lowerCaseQuery = query.toLowerCase();
    const filteredResults = allSearchableItems.filter(item => 
      item.name.toLowerCase().includes(lowerCaseQuery)
    );
    setResults(filteredResults);
    setActiveIndex(0);
  }, [query, allSearchableItems]);

  const handleSelect = (result: SearchResult) => {
    // Expand all parent folders
    const parts = result.path.split('/');
    let currentPath = '';
    const pathsToExpand = new Set<string>();
    
    // For a file, expand up to its parent. For a folder, expand the folder itself too.
    const loopLimit = result.type === 'file' ? parts.length - 1 : parts.length;

    for (let i = 0; i < loopLimit; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (currentPath) {
          pathsToExpand.add(currentPath);
        }
    }
    if (pathsToExpand.size > 0) {
        setExpandedFolders(prev => new Set([...prev, ...pathsToExpand]));
    }
    
    if (result.type === 'file') {
      onOpenFileEditor(result.path);
    }
    
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) {
        if (e.key === 'Escape') onClose();
        return;
    };

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };
  
  // Scroll active item into view
  useEffect(() => {
    resultsRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({
        block: 'nearest',
    });
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[15vh]" onClick={onClose}>
      <div 
        className="bg-[#1e1f20] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col border border-gray-700/50 animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center p-3 border-b border-gray-700/50">
            <Search size={20} className="text-gray-500 mr-3 flex-shrink-0" />
            <input
                ref={inputRef}
                type="text"
                placeholder="Search for files and folders..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-lg text-gray-200 placeholder-gray-500 focus:outline-none"
            />
            <button
                onClick={onClose}
                className="p-2 ml-2 rounded-full hover:bg-gray-700 transition-colors"
                aria-label="Close search"
            >
                <X size={20} />
            </button>
        </div>
        
        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar">
            {query && results.length === 0 && (
                <div className="text-center text-gray-400 p-8">
                    No results found for "<span className="font-semibold text-gray-200">{query}</span>"
                </div>
            )}
            {results.length > 0 && (
                <ul>
                    {results.map((result, index) => {
                        const Icon = result.type === 'folder' ? Folder : FileText;
                        return (
                            <li key={result.path}>
                                <button
                                    data-index={index}
                                    onClick={() => handleSelect(result)}
                                    className={`w-full text-left flex items-center gap-3 px-4 py-3 ${
                                        index === activeIndex ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'
                                    }`}
                                >
                                    <Icon size={18} className="text-gray-400 flex-shrink-0" />
                                    <div className="truncate">
                                        <span className="text-gray-100">{result.name}</span>
                                        <span className="text-xs text-gray-500 ml-2">{result.parentPath || './'}</span>
                                    </div>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
      </div>
    </div>
  );
};

export default FileSearchModal;
