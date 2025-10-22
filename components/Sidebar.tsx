import React from 'react';
import { Menu, Pencil, Settings } from './icons';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, onNewChat, onOpenSettings }) => {
  return (
    <div
      className={`bg-[#1e1f20] flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64 p-4' : 'w-16 p-2'
      }`}
    >
      <div className="flex-shrink-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-full hover:bg-gray-700 transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      <div className="mt-4 flex-shrink-0">
        <button
          onClick={onNewChat}
          className={`flex items-center w-full p-2 rounded-lg transition-colors ${isOpen ? 'bg-gray-700/50 hover:bg-gray-600/50' : 'hover:bg-gray-700'}`}
        >
          <Pencil size={20} className="flex-shrink-0" />
          {isOpen && <span className="ml-4 font-semibold text-sm">New chat</span>}
        </button>
      </div>

      <div className="mt-auto flex-shrink-0">
        <button
          onClick={onOpenSettings}
          className="flex items-center w-full p-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Settings size={20} className="flex-shrink-0" />
          {isOpen && <span className="ml-4 font-semibold text-sm">Settings</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;