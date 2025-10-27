import React, { useRef, useState, useEffect } from 'react';
import { Menu, Plus, Settings, FolderSync, Folder, Trash2, FilePlus, FolderPlus } from '../../components/icons';
import FileTree from './FileTree';
import { useFileSystem } from './FileSystemContext';
import { useChat } from '../chat/ChatContext';
import { useSettings } from '../settings/SettingsContext';
import FileSearchModal from './FileSearchModal';


interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isMobile: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    isOpen, setIsOpen, isMobile
}) => {
  const { 
    syncProject, displayContext, unlinkProject,
    onCreateFile, onCreateFolder, fileInputRef,
    setCreatingIn
  } = useFileSystem();
  const { 
    onNewChat, isLoading: isChatLoading
  } = useChat();
  const { 
    setIsSettingsModalOpen
  } = useSettings();

  const [isCreateMenuOpen, setCreateMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const isHoveringFileTree = useRef(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (isHoveringFileTree.current) {
          e.preventDefault();
          setIsSearchModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);


  const handleProjectSyncClick = () => {
    fileInputRef.current?.click();
  };

  const handleDirectoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      syncProject(event.target.files);
    }
    event.target.value = ''; 
  };
  
  const handleNewChatClick = () => {
    onNewChat();
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <FileSearchModal 
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />
      <div
        className={`bg-[#1e1f20] flex flex-col transition-all duration-300 ease-in-out ${
          isOpen ? 'w-72 p-4' : 'w-20 p-3'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleDirectoryChange}
          className="hidden"
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
        />
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
            onClick={handleProjectSyncClick}
            disabled={isChatLoading}
            title="Sync Local Folder"
            className={`flex items-center w-full p-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isOpen ? 'hover:bg-gray-700/70 justify-start' : 'hover:bg-gray-700 justify-center'
            }`}
          >
            <FolderSync size={24} className="flex-shrink-0" />
            <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-3' : 'w-0 ml-0'}`}>
              <span className="font-medium text-sm whitespace-nowrap">Upload Folder</span>
            </div>
          </button>
        </div>
        
        {isOpen && (
          <div className="mt-6 pt-4 border-t border-gray-700/60 flex-1 flex flex-col min-h-0">
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

            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1 -mr-2"
              onMouseEnter={() => { isHoveringFileTree.current = true; }}
              onMouseLeave={() => { isHoveringFileTree.current = false; }}
            >
              <FileTree />
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
    </>
  );
};

export default Sidebar;
