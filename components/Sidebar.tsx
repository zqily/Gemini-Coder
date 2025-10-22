
import React, { useRef } from 'react';
import { Menu, Plus, Settings, UploadCloud, GitBranch, Trash2 } from './icons';
import FileTree from './FileTree';
import type { ProjectContext } from '../types';


interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  isMobile: boolean;
  onProjectSync: (files: FileList) => void;
  displayContext: ProjectContext | null;
  originalContext: ProjectContext | null;
  deletedItems: ProjectContext;
  onUnlinkProject: () => void;
  onOpenFileEditor: (path: string) => void;
  excludedPaths: Set<string>;
  onTogglePathExclusion: (path: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, onNewChat, onOpenSettings, onProjectSync, displayContext, originalContext, deletedItems, onUnlinkProject, onOpenFileEditor, excludedPaths, onTogglePathExclusion }) => {
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleProjectSyncClick = () => {
    directoryInputRef.current?.click();
  };

  const handleDirectoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onProjectSync(event.target.files);
    }
    // Reset the input value to allow selecting the same folder again
    event.target.value = ''; 
  };
  
  return (
    <div
      className={`bg-[#1e1f20] flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'w-72 p-4' : 'w-20 p-3'
      }`}
    >
      <input
        type="file"
        ref={directoryInputRef}
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
          onClick={onNewChat}
          className={`flex items-center w-full p-2.5 rounded-xl transition-colors ${
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
          className={`flex items-center w-full p-2.5 rounded-xl transition-colors ${
            isOpen ? 'hover:bg-gray-700/70 justify-start' : 'hover:bg-gray-700 justify-center'
          }`}
        >
          <UploadCloud size={24} className="flex-shrink-0" />
           <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-3' : 'w-0 ml-0'}`}>
             <span className="font-medium text-sm whitespace-nowrap">Sync Project</span>
          </div>
        </button>
      </div>
      
      {displayContext && isOpen && (
          <div className="mt-6 pt-4 border-t border-gray-700/60 flex-1 overflow-y-auto overflow-x-hidden">
             <div className="flex items-center justify-between gap-2 mb-3 px-1 text-gray-400">
                <div className="flex items-center gap-2">
                    <GitBranch size={16}/>
                    <h3 className="font-semibold text-xs uppercase tracking-wider">Project Files</h3>
                </div>
                <button
                    onClick={onUnlinkProject}
                    className="p-1 rounded-md hover:bg-gray-700 hover:text-red-400 transition-colors"
                    aria-label="Unlink project"
                    title="Unlink project"
                >
                    <Trash2 size={14} />
                </button>
            </div>
             <FileTree 
                allFiles={displayContext.files} 
                allDirs={displayContext.dirs} 
                originalContext={originalContext}
                deletedItems={deletedItems}
                onFileClick={onOpenFileEditor}
                excludedPaths={excludedPaths}
                onTogglePathExclusion={onTogglePathExclusion}
             />
          </div>
      )}


      <div className="mt-auto flex-shrink-0 space-y-2 pt-4 border-t border-gray-700/60">
        <button
          onClick={onOpenSettings}
          className={`flex items-center w-full p-2 rounded-lg hover:bg-gray-700 transition-colors ${!isOpen && 'justify-center'}`}
        >
          <Settings size={20} className="flex-shrink-0" />
           <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-auto ml-2' : 'w-0 ml-0'}`}>
             <span className="font-medium text-sm whitespace-nowrap">Settings & API</span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
