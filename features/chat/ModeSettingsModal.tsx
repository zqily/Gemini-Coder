import React, { useState, useEffect, useCallback } from 'react';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';
import { X, Save } from '../../components/icons';
import type { AdvancedCoderSettings } from '../../types';

const ModeSettingsModal: React.FC = () => {
  const { isModeSettingsModalOpen, modeSettingsModalConfig, closeModeSettingsModal, modes } = useChat();
  const {
    advancedCoderSettings,
    setAdvancedCoderSettings
  } = useSettings();
  
  const [localAdvancedSettings, setLocalAdvancedSettings] = useState<AdvancedCoderSettings>(advancedCoderSettings);
  const [isClosing, setIsClosing] = useState(false);
  
  useEffect(() => {
    if (isModeSettingsModalOpen) {
      setLocalAdvancedSettings(advancedCoderSettings);
    }
  }, [isModeSettingsModalOpen, advancedCoderSettings]);
  
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      closeModeSettingsModal();
      setIsClosing(false); // Reset for next open
    }, 200); // Animation duration
  }, [closeModeSettingsModal]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isModeSettingsModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModeSettingsModalOpen, handleClose]);

  if (!isModeSettingsModalOpen || !modeSettingsModalConfig || modeSettingsModalConfig.modeId !== 'advanced-coder') {
    return null;
  }

  const { modeId } = modeSettingsModalConfig;
  
  const isDirty = localAdvancedSettings.phaseCount !== advancedCoderSettings.phaseCount;

  const handleSave = () => {
    if (modeId === 'advanced-coder') {
      setAdvancedCoderSettings(localAdvancedSettings);
    }
    handleClose();
  };
  
  const advancedCoderOptions: { count: AdvancedCoderSettings['phaseCount'], title: string, description: string }[] = [
      { count: 3, title: 'Fastest', description: 'Plan -> Implement. Good for simple tasks.' },
      { count: 6, title: 'Balanced', description: 'Plan -> Draft -> Review -> Implement.' },
      { count: 9, title: 'Thorough', description: 'Includes 2 draft/review cycles.' },
      { count: 12, title: 'Exhaustive', description: 'Includes 3 draft/review cycles.' },
  ];

  const renderAdvancedCoderSettings = () => (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Process Complexity</label>
      <div className="grid grid-cols-2 gap-2">
        {advancedCoderOptions.map(({ count, title, description }) => (
          <button
            key={count}
            onClick={() => setLocalAdvancedSettings({ phaseCount: count })}
            className={`p-3 text-left rounded-lg transition-all border-2 ${
              localAdvancedSettings.phaseCount === count
                ? 'bg-blue-600/20 border-blue-500'
                : 'bg-gray-700/50 hover:bg-gray-700 border-transparent hover:border-gray-600'
            }`}
          >
            <p className="font-semibold text-sm text-white">{count} Phases</p>
            <p className="text-xs text-gray-400">{title}</p>
          </button>
        ))}
      </div>
       <p className="text-xs text-gray-500 mt-4">
        Higher counts perform more draft/review cycles for complex tasks, but are slower and use more tokens.
      </p>
    </div>
  );

  const modeDetails = modes[modeId];
  const Icon = modeDetails.icon;

  return (
    <div 
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} 
      onClick={handleClose}
    >
      <div 
        className={`bg-[#2c2d2f] w-full max-w-lg max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-gray-700/50 ${isClosing ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
          <h2 className="flex items-center gap-3 text-xl font-bold text-white">
            {React.createElement(Icon, { size: 24, className: modeId === 'advanced-coder' ? 'text-purple-400' : 'text-blue-400' })}
            {modeDetails.name} Settings
          </h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close settings">
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {modeId === 'advanced-coder' && renderAdvancedCoderSettings()}
        </main>
      
        <footer className="p-4 flex justify-end gap-2 bg-gray-900/20 border-t border-gray-700/50 rounded-b-xl flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} className="inline-block mr-1" />
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModeSettingsModal;