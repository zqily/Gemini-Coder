import React, { useState, useEffect, useRef } from 'react';
import { X } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  sendWithCtrlEnter: boolean;
  setSendWithCtrlEnter: (enabled: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, apiKey, setApiKey, sendWithCtrlEnter, setSendWithCtrlEnter }) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [localSendShortcut, setLocalSendShortcut] = useState(sendWithCtrlEnter);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalKey(apiKey);
    setLocalSendShortcut(sendWithCtrlEnter);
    if (isOpen) {
        // Autofocus the input when the modal opens
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [apiKey, isOpen, sendWithCtrlEnter]);

  // Add ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);


  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(localKey);
    setSendWithCtrlEnter(localSendShortcut);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-[#2c2d2f] rounded-lg shadow-xl p-8 w-full max-w-md relative animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white" aria-label="Close settings">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">Settings</h2>
        
        <div className="space-y-6">
          <div>
            <label htmlFor="sendShortcut" className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-gray-300">
                Use Ctrl + Enter to send
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  id="sendShortcut"
                  className="sr-only peer"
                  checked={localSendShortcut}
                  onChange={(e) => setLocalSendShortcut(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-2">
              When enabled, Enter creates a new line and Ctrl+Enter sends the prompt. When disabled, Enter sends the prompt.
            </p>
          </div>
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
              Gemini API Key
            </label>
            <input
              ref={inputRef}
              type="password"
              id="apiKey"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter your API key"
            />
             <p className="text-xs text-gray-500 mt-2">
                Your API key is saved securely in your browser's local storage.
             </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
