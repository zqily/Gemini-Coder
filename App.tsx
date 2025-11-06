import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './features/file-system/Sidebar';
import MainContent from './features/chat/MainContent';
import SettingsProvider from './features/settings/SettingsProvider';
import FileEditorModal from './features/file-system/FileEditorModal';
import FileSystemProvider from './features/file-system/FileSystemProvider';
import ChatProvider from './features/chat/ChatProvider';
import { useChat } from './features/chat/ChatContext';
import { useFileSystem } from './features/file-system/FileSystemContext';
import { ImageIcon } from './components/Icons';
import FileSearchModal from './features/file-system/FileSearchModal';
import { useSettings } from './features/settings/SettingsContext';
import { ToastProvider } from './features/toast/ToastProvider';
import ModeSettingsPanel from './features/chat/ModeSettingsPanel';


// Custom hook to detect window size
const useWindowSize = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};


const AppContent: React.FC = () => {
  const isMobile = useWindowSize();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const { isLoading: isChatLoading, isReadingFilesFs: isChatProviderReadingFiles, onNewChat } = useChat();
  const {
    isDragging,
    isReadingFiles,
    handleGlobalDragEnter,
    handleGlobalDragOver,
    handleGlobalDrop,
    handleDragLeave,
    editingFile,
  } = useFileSystem();
  const { setIsSettingsModalOpen } = useSettings();

  // Combine both reading states for global drag listener condition
  const combinedIsReadingFiles = isReadingFiles || isChatProviderReadingFiles;

  useEffect(() => {
    // Only add global drag listeners if not in an active chat or file reading state
    if (!isChatLoading && !combinedIsReadingFiles) {
        window.addEventListener('dragenter', handleGlobalDragEnter);
        window.addEventListener('dragover', handleGlobalDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleGlobalDrop);
    }

    return () => {
        window.removeEventListener('dragenter', handleGlobalDragEnter);
        window.removeEventListener('dragover', handleGlobalDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleGlobalDrop);
    };
  }, [isChatLoading, combinedIsReadingFiles, handleGlobalDragEnter, handleGlobalDragOver, handleGlobalDrop, handleDragLeave]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // We only care about shortcuts with Ctrl or Command
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }

      const key = e.key.toLowerCase();

      // New Chat: Ctrl+N or Ctrl+Shift+N
      if (key === 'n') {
        e.preventDefault();
        onNewChat();
        return;
      }
      
      // Open File Search: Ctrl+S or Ctrl+Shift+F
      if (key === 's' || (key === 'f' && e.shiftKey)) {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
      }
      
      // Open Settings: Ctrl+,
      if (key === ',') {
        e.preventDefault();
        setIsSettingsModalOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onNewChat, setIsSearchModalOpen, setIsSettingsModalOpen]);


  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
       {isDragging && (
        <div className="absolute inset-0 bg-blue-900/40 border-2 border-dashed border-blue-400 rounded-2xl z-50 flex items-center justify-center pointer-events-none animate-fade-in m-2">
          <div className="text-center text-white p-6 bg-black/60 rounded-xl backdrop-blur-sm">
            <ImageIcon size={48} className="mx-auto mb-3 text-blue-300" />
            <p className="text-xl font-bold">Drop files to add to project</p>
            <p className="text-sm text-gray-300">Images, text, code, PDFs and more</p>
          </div>
        </div>
      )}
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        isMobile={isMobile}
      />
      <MainContent
        toggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isMobile={isMobile}
      />
      {editingFile && <FileEditorModal />}
      <FileSearchModal 
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />
      <ModeSettingsPanel />
    </div>
  );
};


const App: React.FC = () => {
return (
     <SettingsProvider>
      <ToastProvider>
        <FileSystemProvider>
           <ChatProvider>
             <AppContent />
           </ChatProvider>
        </FileSystemProvider>
      </ToastProvider>
     </SettingsProvider>
  );
};

export default App;