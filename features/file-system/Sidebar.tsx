import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Menu, Plus, Settings, FolderSync, Folder, Trash2, FilePlus, FolderPlus, Save, GitBranch } from '../../components/icons';
import FileTree from './FileTree';
import { useFileSystem } from './FileSystemContext';
import { useChat } from '../chat/ChatContext';
import { useSettings } from '../settings/SettingsContext';


interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isMobile: boolean;
}

// --- Resizing Logic Constants ---
const SIDEBAR_WIDTH_STORAGE_KEY = 'gemini-sidebar-width';
const MIN_WIDTH = 224; // 14rem
const MAX_WIDTH = 512; // 32rem
const DEFAULT_WIDTH = 288; // 18rem

const getInitialWidth = (): number => {
  try {
    const storedValue = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (storedValue) {
      const parsedWidth = parseInt(storedValue, 10);
      return Math.max(MIN_WIDTH, Math.min(parsedWidth, MAX_WIDTH));
    }
    return DEFAULT_WIDTH;
  } catch (error) {
    return DEFAULT_WIDTH;
  }
};


const Sidebar: React.FC<SidebarProps> = ({ 
    isOpen, setIsOpen, isMobile
}) => {
  const { 
    syncProject, displayContext, unlinkProject,
    onCreateFile, onCreateFolder,
    setCreatingIn,
    rootDirHandle,
    hasUnappliedChanges,
    applyChangesToDisk,
    revertChanges
  } = useFileSystem();
  const { 
    onNewChat, isLoading: isChatLoading
  } = useChat();
  const { 
    setIsSettingsModalOpen
  } = useSettings();

  const [isCreateMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  // --- Resizing Logic ---
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const stopResizing = () => setIsResizing(false);
    
    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const newWidth = e.clientX;
            const clampedWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
            setSidebarWidth(clampedWidth);
        }
    };
  
    if (!isMobile) {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        document.addEventListener('mouseleave', stopResizing);
    }
    
    return () => {
        if (!isMobile) {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.removeEventListener('mouseleave', stopResizing);
        }
    };
  }, [isResizing, isMobile]);

  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    }
  }, [sidebarWidth, isMobile]);

  useEffect(() => {
    if (isResizing) {
      document.body.classList.add('resizing-sidebar');
    } else {
      document.body.classList.remove('resizing-sidebar');
    }
  }, [isResizing]);

  // --- Scroll Fade Logic ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element || !isOpen) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      setShowTopFade(scrollTop > 1);
      setShowBottomFade(scrollHeight - scrollTop - clientHeight > 1);
    };
    
    handleScroll(); // Initial check
    element.addEventListener('scroll', handleScroll);
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(element);
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
      resizeObserver.unobserve(element);
    };
  }, [isOpen]); // Re-run when sidebar opens/closes and element becomes available/visible

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isCreateMenuOpen &&
        createMenuRef.current &&
        !createMenuRef.current.contains(event.target as Node) &&
        !createButtonRef.current?.contains(event.target as Node)
      ) {
        setCreateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCreateMenuOpen]);

  const handleNewChatClick = () => {
    onNewChat();
    if (isMobile) {
      setIsOpen(false);
    }
  };

  const desktopWidth = isOpen ? sidebarWidth : '5rem';
  const mobileWidth = isOpen ? '18rem' : '0rem'; // w-72 for mobile open

  return (
    <>
      <div
        className={`bg-[#1e1f20] flex flex-col flex-shrink-0 ${
            isMobile
                ? `transition-all duration-300 ease-in-out ${isOpen ? 'p-4' : 'p-0 w-0'}`
                : `${isOpen ? 'p-4' : 'p-3'}`
        }`}
        style={{
            width: isMobile ? mobileWidth : desktopWidth,
            transition: !isMobile && isResizing ? 'none' : 'width 0.2s ease-in-out',
            overflow: isMobile && !isOpen ? 'hidden' : 'visible',
        }}
      >
        <div className="flex-shrink-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-full hover:bg-gray-700 transition-all hover:scale-105 active:scale-95"
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu size={24} />
          </button>
        </div>

        <div className="mt-6 flex-shrink-0 space-y-2">
          <button
            onClick={handleNewChatClick}
            disabled={isChatLoading}
            className={`flex items-center w-full p-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isOpen ? 'bg-[#3c3d3f] hover:bg-[#4b4c4e] justify-start' : 'hover:bg-gray-700 justify-center'
            }`}
          >
            <Plus size={24} className="flex-shrink-0" />
            <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-3' : 'w-0 ml-0'}`}>
              <span className="font-medium text-sm whitespace-nowrap">New chat</span>
            </div>
          </button>
          <button
            onClick={syncProject}
            disabled={isChatLoading}
            title="Sync Local Folder (Read/Write)"
            className={`flex items-center w-full p-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isOpen ? 'hover:bg-gray-700/70 justify-start' : 'hover:bg-gray-700 justify-center'
            }`}
          >
            <FolderSync size={24} className="flex-shrink-0" />
            <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-3' : 'w-0 ml-0'}`}>
              <span className="font-medium text-sm whitespace-nowrap">Sync Folder</span>
            </div>
          </button>
        </div>
        
        {isOpen && (
          <div className="mt-6 pt-4 border-t border-gray-700/60 flex-1 flex flex-col min-h-0">
            {rootDirHandle && hasUnappliedChanges && (
              <div className="flex-shrink-0 mb-4 p-3 bg-gray-800/50 rounded-lg animate-fade-in space-y-2">
                <p className="text-xs text-center text-yellow-300">You have unapplied changes.</p>
                <button
                  onClick={applyChangesToDisk}
                  disabled={isChatLoading}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-md transition-colors disabled:bg-gray-500"
                >
                  <Save size={16} /> Apply Changes
                </button>
                <button
                  onClick={revertChanges}
                  disabled={isChatLoading}
                  className="w-full flex items-center justify-center gap-2 border border-red-500 text-red-400 hover:bg-red-500/20 py-1.5 px-3 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  <GitBranch size={14} /> Revert
                </button>
              </div>
            )}
            <div className="group flex items-center justify-between gap-2 mb-2 px-1 text-gray-300 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Folder size={16} />
                <h3 className="font-semibold text-sm">Files</h3>
              </div>
              <div
                className={`flex items-center gap-1 transition-opacity ${
                  displayContext
                    ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                    : 'opacity-100'
                }`}
              >
                <div className="relative">
                  <button
                    ref={createButtonRef}
                    onClick={() => setCreateMenuOpen(prev => !prev)}
                    disabled={isChatLoading}
                    className="p-1 rounded-md hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="New file or folder"
                    title="New file or folder"
                  >
                    <Plus size={16} />
                  </button>
                  {isCreateMenuOpen && (
                    <div
                      ref={createMenuRef}
                      className="context-menu animate-fade-in-up-short absolute top-full right-0 mt-1 z-10"
                    >
                      <button className="context-menu-item" onClick={() => { onCreateFile(''); setCreatingIn({ path: '', type: 'file' }); setCreateMenuOpen(false); }}>
                        <FilePlus size={16} /> New File
                      </button>
                      <button className="context-menu-item" onClick={() => { onCreateFolder(''); setCreatingIn({ path: '', type: 'folder' }); setCreateMenuOpen(false); }}>
                        <FolderPlus size={16} /> New Folder
                      </button>
                    </div>
                  )}
                </div>
                {displayContext && (
                  <button
                    onClick={unlinkProject}
                    disabled={isChatLoading}
                    className="p-1 rounded-md hover:bg-gray-700 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Clear all files"
                    title="Clear all files"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="relative flex-1 overflow-hidden">
                <div 
                    ref={scrollContainerRef}
                    className="absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1 -mr-2"
                    style={{'--fade-color': '#1e1f20'} as React.CSSProperties}
                >
                    <FileTree />
                </div>
                <div className={`scroll-fade-top ${showTopFade ? 'scroll-fade-top-active' : ''}`} />
                <div className={`scroll-fade-bottom ${showBottomFade ? 'scroll-fade-bottom-active' : ''}`} />
            </div>

          </div>
        )}

        <div className="mt-auto flex-shrink-0 space-y-2 pt-4 border-t border-gray-700/60">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            disabled={isChatLoading}
            className={`flex items-center w-full p-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${!isOpen && 'justify-center'}`}
          >
            <Settings size={20} className="flex-shrink-0" />
            <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-2' : 'w-0 ml-0'}`}>
              <span className="font-medium text-sm whitespace-nowrap">Settings & API</span>
            </div>
          </button>
        </div>
      </div>
       {isOpen && !isMobile && (
        <div
            onMouseDown={startResizing}
            className="w-1 h-full cursor-col-resize bg-gray-800/50 hover:bg-blue-600 active:bg-blue-500 transition-colors duration-200 flex-shrink-0"
            aria-label="Resize sidebar"
            role="separator"
        />
      )}
    </>
  );
};

export default Sidebar;