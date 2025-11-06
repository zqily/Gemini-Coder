import React, { useState, useEffect, useRef } from 'react';
import { useChat } from './ChatContext';
import { useSettings } from '../settings/SettingsContext';
import { SIMPLE_CODER_PERSONAS } from './config/personas';
import { X, User } from '../../components/icons';
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

  const { anchorEl, modeId } = modeSettingsPanelConfig;
  
  const isDirty = modeId === 'simple-coder'
    ? (localSimpleSettings.persona !== simpleCoderSettings.persona || localSimpleSettings.customInstruction !== simpleCoderSettings.customInstruction)
    : (localAdvancedSettings.phaseCount !== advancedCoderSettings.phaseCount);

  const handleSave = () => {
    if (modeId === 'simple-coder') {
      setSimpleCoderSettings(localSimpleSettings);
    } else if (modeId === 'advanced-coder') {
      setAdvancedCoderSettings(localAdvancedSettings);
    }
    closeModeSettingsPanel();
  };
  
  const rect = anchorEl.getBoundingClientRect();
  const bottom = window.innerHeight - rect.top + 8;
  const left = rect.left;

  const renderSimpleCoderSettings = () => {
    const selectedPersona = localSimpleSettings.persona;
    const instructionText = selectedPersona === 'custom' 
      ? 'Define a custom persona for the model.' 
      : SIMPLE_CODER_PERSONAS[selectedPersona]?.instruction;

    return (
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-300">Persona</label>
        <div role="radiogroup" className="space-y-2">
          {Object.entries(SIMPLE_CODER_PERSONAS).map(([key, persona]) => (
            <button key={key} role="radio" aria-checked={selectedPersona === key} onClick={() => setLocalSimpleSettings(prev => ({...prev, persona: key}))} className={`persona-card ${selectedPersona === key ? 'persona-card-active' : ''}`}>
              {React.createElement(persona.icon, { size: 18, className: "persona-card-icon" })}
              {persona.name}
            </button>
          ))}
          <button role="radio" aria-checked={selectedPersona === 'custom'} onClick={() => setLocalSimpleSettings(prev => ({...prev, persona: 'custom'}))} className={`persona-card ${selectedPersona === 'custom' ? 'persona-card-active' : ''}`}>
            <User size={18} className="persona-card-icon" />
            Custom...
          </button>
        </div>

        <div className={`preview-pane-container ${selectedPersona ? 'open' : ''}`}>
           <blockquote className="text-xs text-gray-400 italic p-3 bg-black/20 border-l-4 border-gray-600 rounded-r-md">
                {instructionText}
           </blockquote>
        </div>

        <div className={`preview-pane-container ${selectedPersona === 'custom' ? 'open' : ''}`}>
          <textarea
            id="custom-instruction"
            rows={4}
            value={localSimpleSettings.customInstruction}
            onChange={(e) => setLocalSimpleSettings(prev => ({...prev, customInstruction: e.target.value}))}
            className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y text-sm"
            placeholder="e.g., You are a Go developer who prefers concise, idiomatic code..."
          />
        </div>
      </div>
    )
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

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-[#2c2d2f] rounded-xl shadow-2xl w-96 border border-gray-700/50 animate-fade-in-up-short"
      style={{ bottom: `${bottom}px`, left: `${left}px` }}
    >
      <div className="popover-tail" style={{'--popover-bg': '#2c2d2f', '--popover-border': '#4a556880'} as React.CSSProperties} />
      <header className="flex items-center justify-between p-4 border-b border-gray-700/50">
        <h3 className="text-lg font-bold text-white">
            {modeId === 'simple-coder' ? 'Simple Coder Settings' : 'Advanced Coder Settings'}
        </h3>
        <button onClick={closeModeSettingsPanel} className="p-1 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close settings">
          <X size={18} />
        </button>
      </header>
      
      <main className="p-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
        {modeId === 'simple-coder' && renderSimpleCoderSettings()}
        {modeId === 'advanced-coder' && renderAdvancedCoderSettings()}
      </main>
      
      <footer className="p-3 flex justify-end gap-2 bg-gray-900/20 border-t border-gray-700/50 rounded-b-xl">
        <button
          onClick={closeModeSettingsPanel}
          className="px-4 py-2 text-sm font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Changes
        </button>
      </footer>
    </div>
  );
};

export default ModeSettingsPanel;