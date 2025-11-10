import React, { useState, useEffect, useRef } from 'react';
import { X, User, Bot, CodeXml, Plus, Pencil, Trash2 } from '../../components/icons';
import { useSettings } from './SettingsContext';
import { DEFAULT_GENERAL_PERSONA, DEFAULT_CODER_PERSONA } from './usePersonaSettings';
import type { PersonaSettings, CustomPersona } from '../../types';

const generateId = () => `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const PersonaManager: React.FC<{
    type: 'general' | 'coder';
    settings: PersonaSettings;
    setSettings: React.Dispatch<React.SetStateAction<PersonaSettings>>;
    editingPersona: CustomPersona | { id: null, title: string, instruction: string } | null;
    onStartEditing: (type: 'general' | 'coder', persona: CustomPersona | null) => void;
}> = ({ type, settings, setSettings, editingPersona, onStartEditing }) => {
    const isGeneral = type === 'general';
    const defaultPersona = isGeneral ? DEFAULT_GENERAL_PERSONA : DEFAULT_CODER_PERSONA;
    const customPersonas = isGeneral ? settings.customGeneralPersonas : settings.customCoderPersonas;
    const selectedId = isGeneral ? settings.generalPersonaId : settings.coderPersonaId;
    
    const personaList = [defaultPersona, ...customPersonas];
    const selectedPersona = personaList.find(p => p.id === selectedId) || defaultPersona;
    const isCustomSelected = selectedId !== defaultPersona.id;

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setSettings(prev => ({
            ...prev,
            [isGeneral ? 'generalPersonaId' : 'coderPersonaId']: newId,
        }));
    };

    const handleDelete = () => {
        if (!isCustomSelected || !window.confirm(`Are you sure you want to delete the "${selectedPersona.title}" persona?`)) return;
        
        const newCustomPersonas = customPersonas.filter(p => p.id !== selectedId);
        setSettings(prev => ({
            ...prev,
            [isGeneral ? 'customGeneralPersonas' : 'customCoderPersonas']: newCustomPersonas,
            [isGeneral ? 'generalPersonaId' : 'coderPersonaId']: defaultPersona.id,
        }));
    };

    return (
        <div>
            <h4 className="text-base font-semibold text-gray-200 mb-2 flex items-center gap-2">
                {isGeneral ? <Bot size={18} /> : <CodeXml size={18} />}
                {isGeneral ? 'General Persona' : 'Coder Persona'}
            </h4>
            <p className="text-xs text-gray-400 mb-3">
                {isGeneral ? 'Applies to Default mode.' : 'Applies to Simple & Advanced Coder modes.'}
            </p>

            <div className="flex items-center gap-2 mb-3">
                <select 
                    value={selectedId}
                    onChange={handleSelectChange}
                    className="flex-grow bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                    <option disabled>--- Built-in ---</option>
                    <option value={defaultPersona.id}>{defaultPersona.title}</option>
                    {customPersonas.length > 0 && <option disabled>--- Custom ---</option>}
                    {customPersonas.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <button onClick={() => onStartEditing(type, null)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md" title="Add New Persona"><Plus size={16}/></button>
                {isCustomSelected && <button onClick={() => onStartEditing(type, selectedPersona as CustomPersona)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md" title="Edit Persona"><Pencil size={16}/></button>}
                {isCustomSelected && <button onClick={handleDelete} className="p-2 bg-red-900/50 hover:bg-red-900/80 rounded-md text-red-400" title="Delete Persona"><Trash2 size={16}/></button>}
            </div>
            
            <div className="preview-pane-container open">
                <blockquote className="text-xs text-gray-400 italic p-3 bg-black/20 border-l-4 border-gray-600 rounded-r-md">
                        {selectedPersona.instruction}
                </blockquote>
            </div>
        </div>
    );
};

const PersonaEditor: React.FC<{
    persona: { id: string | null, title: string, instruction: string };
    type: 'general' | 'coder';
    onSave: (type: 'general' | 'coder', persona: CustomPersona) => void;
    onCancel: () => void;
}> = ({ persona, type, onSave, onCancel }) => {
    const [title, setTitle] = useState(persona.title);
    const [instruction, setInstruction] = useState(persona.instruction);
    
    const handleSave = () => {
        if (!title.trim() || !instruction.trim()) {
            alert("Title and instruction cannot be empty.");
            return;
        }
        onSave(type, {
            id: persona.id || generateId(),
            title,
            instruction
        });
    };

    return (
        <div className="col-span-1 md:col-span-2 mt-4 p-4 bg-gray-800/50 rounded-lg animate-fade-in">
             <h4 className="text-base font-semibold text-gray-200 mb-3">
                {persona.id ? 'Edit' : 'Add New'} {type === 'general' ? 'General' : 'Coder'} Persona
             </h4>
             <div className="space-y-3">
                <input 
                    type="text"
                    placeholder="Persona Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <textarea
                    rows={6}
                    placeholder="System instruction for the persona..."
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    className="w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y text-sm"
                />
             </div>
             <div className="flex justify-end gap-2 mt-4">
                <button onClick={onCancel} className="px-3 py-1.5 text-sm font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors">Cancel</button>
                <button onClick={handleSave} className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">Save</button>
             </div>
        </div>
    );
};


const SettingsModal: React.FC = () => {
  const { 
    apiKey, setApiKey, 
    sendWithCtrlEnter, setSendWithCtrlEnter, 
    isStreamingEnabled, setStreamingEnabled,
    isGoogleSearchEnabled, setGoogleSearchEnabled,
    isContextTokenUnlocked, setContextTokenUnlocked,
    isSettingsModalOpen, setIsSettingsModalOpen,
    personaSettings, setPersonaSettings,
  } = useSettings();

  const [localKey, setLocalKey] = useState(apiKey);
  const [localSendShortcut, setLocalSendShortcut] = useState(sendWithCtrlEnter);
  const [localStreaming, setLocalStreaming] = useState(isStreamingEnabled);
  const [localGoogleSearch, setLocalGoogleSearch] = useState(isGoogleSearchEnabled);
  const [localContextTokenUnlocked, setLocalContextTokenUnlocked] = useState(isContextTokenUnlocked);
  const [localPersonaSettings, setLocalPersonaSettings] = useState<PersonaSettings>(personaSettings);
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [editingPersona, setEditingPersona] = useState<{
      type: 'general' | 'coder';
      persona: CustomPersona | null;
  } | null>(null);


  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsSettingsModalOpen(false);
      setIsClosing(false); // Reset for next open
    }, 200); // Animation duration
  };

  useEffect(() => {
    if (isSettingsModalOpen) {
      setLocalKey(apiKey);
      setLocalSendShortcut(sendWithCtrlEnter);
      setLocalStreaming(isStreamingEnabled);
      setLocalGoogleSearch(isGoogleSearchEnabled);
      setLocalContextTokenUnlocked(isContextTokenUnlocked);
      setLocalPersonaSettings(personaSettings);
      setEditingPersona(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [apiKey, isSettingsModalOpen, sendWithCtrlEnter, isStreamingEnabled, isGoogleSearchEnabled, isContextTokenUnlocked, personaSettings]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingPersona) {
            setEditingPersona(null);
        } else {
            handleClose();
        }
      }
    };
    if (isSettingsModalOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsModalOpen, editingPersona]);


  if (!isSettingsModalOpen) return null;

  const handleSave = () => {
    setApiKey(localKey);
    setSendWithCtrlEnter(localSendShortcut);
    setStreamingEnabled(localStreaming);
    setGoogleSearchEnabled(localGoogleSearch);
    setContextTokenUnlocked(localContextTokenUnlocked);
    setPersonaSettings(localPersonaSettings);
    handleClose();
  };
  
  const handleStartEditing = (type: 'general' | 'coder', persona: CustomPersona | null) => {
      setEditingPersona({ type, persona });
  };

  const handleSavePersona = (type: 'general' | 'coder', personaToSave: CustomPersona) => {
      const isGeneral = type === 'general';
      setLocalPersonaSettings(prev => {
          const newSettings = { ...prev };
          let customList = isGeneral ? [...newSettings.customGeneralPersonas] : [...newSettings.customCoderPersonas];
          const existingIndex = customList.findIndex(p => p.id === personaToSave.id);

          if (existingIndex > -1) {
              customList[existingIndex] = personaToSave; // Update existing
          } else {
              customList.push(personaToSave); // Add new
          }
          
          if (isGeneral) {
              newSettings.customGeneralPersonas = customList;
              newSettings.generalPersonaId = personaToSave.id; // Auto-select the new/edited persona
          } else {
              newSettings.customCoderPersonas = customList;
              newSettings.coderPersonaId = personaToSave.id;
          }
          return newSettings;
      });
      setEditingPersona(null);
  };


  return (
    <div className={`fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={handleClose}>
      <div className={`bg-[#2c2d2f] rounded-lg shadow-xl p-8 w-full max-w-4xl max-h-[90vh] flex flex-col relative ${isClosing ? 'animate-fade-out-scale' : 'animate-fade-in-scale'}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-white" aria-label="Close settings">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white flex-shrink-0">Settings</h2>
        
        <main className="flex-1 overflow-y-auto pr-4 -mr-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                
                <div className="col-span-1 md:col-span-2">
                    <h3 className="text-lg font-semibold text-gray-200 mb-3">Model Behavior</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 bg-black/20 rounded-lg">
                        <PersonaManager type="general" settings={localPersonaSettings} setSettings={setLocalPersonaSettings} editingPersona={editingPersona?.type === 'general' ? (editingPersona.persona || { id: null, title: '', instruction: '' }) : null} onStartEditing={handleStartEditing} />
                        <PersonaManager type="coder" settings={localPersonaSettings} setSettings={setLocalPersonaSettings} editingPersona={editingPersona?.type === 'coder' ? (editingPersona.persona || { id: null, title: '', instruction: '' }) : null} onStartEditing={handleStartEditing} />
                    </div>
                     {editingPersona && (
                        <PersonaEditor
                            type={editingPersona.type}
                            persona={editingPersona.persona || { id: null, title: '', instruction: '' }}
                            onSave={handleSavePersona}
                            onCancel={() => setEditingPersona(null)}
                        />
                     )}
                </div>

                <div className="space-y-6">
                     <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">API & Network</h3>
                        <div className="space-y-4">
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
                            <div>
                                <label htmlFor="googleSearchToggle" className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm font-medium text-gray-300">
                                    Enable Google Search
                                </span>
                                <div className="relative">
                                    <input
                                    type="checkbox"
                                    id="googleSearchToggle"
                                    className="sr-only peer"
                                    checked={localGoogleSearch}
                                    onChange={(e) => setLocalGoogleSearch(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </div>
                                </label>
                                <p className="text-xs text-gray-500 mt-2">
                                Allows the model to search Google. Only applies to 'Default' mode and disables streaming.
                                </p>
                            </div>
                             <div>
                                <label htmlFor="unlockContextToggle" className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm font-medium text-gray-300">
                                    Unlock Context Token Limit
                                </span>
                                <div className="relative">
                                    <input
                                    type="checkbox"
                                    id="unlockContextToggle"
                                    className="sr-only peer"
                                    checked={localContextTokenUnlocked}
                                    onChange={(e) => setLocalContextTokenUnlocked(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </div>
                                </label>
                                <p className="text-xs text-gray-500 mt-2">
                                For paid API keys with higher TPMs. This disables the TPM manager and raises the input token limit to 1M.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                     <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">Editor Experience</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="streamingToggle" className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm font-medium text-gray-300">
                                    Enable Streaming
                                </span>
                                <div className="relative">
                                    <input
                                    type="checkbox"
                                    id="streamingToggle"
                                    className="sr-only peer"
                                    checked={localStreaming}
                                    onChange={(e) => setLocalStreaming(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </div>
                                </label>
                                <p className="text-xs text-gray-500 mt-2">
                                Receive responses as they are generated. Coding modes will disable this setting automatically.
                                </p>
                            </div>
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
                                When enabled, Enter creates a new line and Ctrl+Enter sends. When disabled, Enter sends.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <div className="mt-8 flex justify-end flex-shrink-0">
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