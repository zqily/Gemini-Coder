import React from 'react';
import { Menu, Plus, Settings } from './icons';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  isMobile: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, onNewChat, onOpenSettings }) => {
  return (
    <div
      className={`bg-[#1e1f20] flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64 p-4' : 'w-20 p-3'
      }`}
    >
      <div className="flex-shrink-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-full hover:bg-gray-700 transition-all hover:scale-105 active:scale-95"
        >
          <Menu size={24} />
        </button>
      </div>

      <div className="mt-6 flex-shrink-0">
        <button
          onClick={onNewChat}
          className={`flex items-center w-full p-2.5 rounded-xl transition-colors ${
            isOpen ? 'bg-[#3c3d3f] hover:bg-[#4b4c4e]' : 'hover:bg-gray-700 justify-center'
          }`}
        >
          <Plus size={24} className="flex-shrink-0" />
          <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-full' : 'w-0 ml-0'}`}>
             <span className="font-medium text-sm whitespace-nowrap">New chat</span>
          </div>
        </button>
      </div>

      <div className="mt-auto flex-shrink-0 space-y-2">
        <button
          onClick={onOpenSettings}
          className={`flex items-center w-full p-2 rounded-lg hover:bg-gray-700 transition-colors ${!isOpen && 'justify-center'}`}
        >
          <Settings size={20} className="flex-shrink-0" />
           <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-full' : 'w-0 ml-0'}`}>
             <span className="font-medium text-sm whitespace-nowrap">Settings & API</span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;