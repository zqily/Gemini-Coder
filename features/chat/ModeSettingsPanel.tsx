import React, { useState, useEffect, useRef } from 'react';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';
import { SIMPLE_CODER_PERSONAS } from './config/personas';
import { X } from '../../components/icons';
import type { SimpleCoderSettings, AdvancedCoderSettings } from '../../types';

const ModeSettingsPanel: React.FC = () => {
  const { isModeSettingsPanelOpen, modeSettingsPanelConfig, closeModeSettingsPanel } = useChat();
  const {
    simpleCoderSettings,
    setSimpleCoderSettings,
    advancedCoderSettings,
    setAdvancedCoderSettings
  } = useSettings();
  
  const [localSimpleSettings, setLocalSimpleSettings] = useState<SimpleCoderSettings>(simpleCoderSettings);
  const [localAdvancedSettings, setLocalAdvancedSettings] = useState<AdvancedCoderSettings>(advancedCoderSettings);
  
  const panelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isModeSettingsPanelOpen) {
      setLocalSimpleSettings(simpleCoderSettings);
      setLocalAdvancedSettings(advancedCoderSettings);
    }
  }, [isModeSettingsPanelOpen, simpleCoderSettings, advancedCoderSettings]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        closeModeSettingsPanel();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModeSettingsPanel();
      }
    };

    if (isModeSettingsPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModeSettingsPanelOpen, closeModeSettingsPanel]);

  if (!isModeSettingsPanelOpen || !modeSettingsPanelConfig) return null;

  const handleSave = () => {
    if (modeSettingsPanelConfig.modeId === 'simple-coder') {
      setSimpleCoderSettings(localSimpleSettings);
    } else if (modeSettingsPanelConfig.modeId === 'advanced-coder') {
      setAdvancedCoderSettings(localAdvancedSettings);
    }
    closeModeSettingsPanel();
  };
  
  const { anchorEl, modeId } = modeSettingsPanelConfig;
  const rect = anchorEl.getBoundingClientRect();
  const bottom = window.innerHeight - rect.top + 8;
  const left = rect.left;

  const renderSimpleCoderSettings = () => (
    <>
      <div>
        <label htmlFor="persona-select" className="block text-sm font-medium text-gray-300 mb-2">Persona</label>
        <select
          id="persona-select"
          value={localSimpleSettings.persona}
          onChange={(e) => setLocalSimpleSettings(prev => ({...prev, persona: e.target.value}))}
          className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {Object.entries(SIMPLE_CODER_PERSONAS).map(([key, persona]) => (
            <option key={key} value={key}>{persona.name}</option>
          ))}
          <option value="custom">Custom...</option>
        </select>
      </div>
      {localSimpleSettings.persona === 'custom' && (
        <div className="mt-4">
          <label htmlFor="custom-instruction" className="block text-sm font-medium text-gray-300 mb-2">Custom Instruction</label>
          <textarea
            id="custom-instruction"
            rows={4}
            value={localSimpleSettings.customInstruction}
            onChange={(e) => setLocalSimpleSettings(prev => ({...prev, customInstruction: e.target.value}))}
            className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
            placeholder="e.g., You are a Go developer who prefers concise, idiomatic code..."
          />
        </div>
      )}
    </>
  );
  
  const renderAdvancedCoderSettings = () => (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">Phase Count</label>
      <div className="grid grid-cols-2 gap-2">
        {([3, 6, 9, 12] as const).map(count => (
          <button
            key={count}
            onClick={() => setLocalAdvancedSettings({ phaseCount: count })}
            className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c2d2f] focus-visible:ring-blue-500 ${
              localAdvancedSettings.phaseCount === count
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700/50 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {count} Phases
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Higher counts perform more draft/review cycles for complex tasks, but take longer.
      </p>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-[#2c2d2f] rounded-lg shadow-2xl p-4 w-80 border border-gray-700/50 animate-fade-in-up-short"
      style={{ bottom: `${bottom}px`, left: `${left}px` }}
    >
      <header className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">
            {modeId === 'simple-coder' ? 'Simple Coder Settings' : 'Advanced Coder Settings'}
        </h3>
        <button onClick={closeModeSettingsPanel} className="p-1 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close settings">
          <X size={18} />
        </button>
      </header>
      
      <main>
        {modeId === 'simple-coder' && renderSimpleCoderSettings()}
        {modeId === 'advanced-coder' && renderAdvancedCoderSettings()}
      </main>
      
      <footer className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
        >
          Save & Close
        </button>
      </footer>
    </div>
  );
};

export default ModeSettingsPanel;