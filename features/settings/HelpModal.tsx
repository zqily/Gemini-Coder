import React, { useState, useEffect } from 'react';
import { X, KeyRound, FilePlus, GitBranch, CodeXml, MousePointerClick, Check, Copy, BrainCircuit } from '../../components/icons';
import { useSettings } from './SettingsContext';

const HelpModal: React.FC = () => {
  const { 
    apiKey, setApiKey, 
    isHelpModalOpen, setIsHelpModalOpen 
  } = useSettings(); // Use isHelpModalOpen and setIsHelpModalOpen from context

  const [localKey, setLocalKey] = useState(apiKey);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey, isHelpModalOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpModalOpen(false);
      }
    };
    if (isHelpModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpModalOpen, setIsHelpModalOpen]);

  if (!isHelpModalOpen) return null; // Use isHelpModalOpen for visibility

  const handleSave = () => {
    setApiKey(localKey);
  };
  
  const handleCopyExample = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const features = [
    {
        icon: FilePlus,
        title: "Attach Files",
        description: "Drag & drop files onto the app or use the '+' button to add context to your conversation. You can attach images, code, PDFs, and more."
    },
    {
        icon: GitBranch,
        title: "Sync Local Project",
        description: "Click 'Sync Project' in the sidebar to load an entire folder. The app will respect your .gitignore and .gcignore files."
    },
    {
        icon: CodeXml,
        title: "Coder Mode",
        description: "Switch to 'Simple Coder' mode to enable file system tools. Gemini can then directly create, delete, and modify files in your synced project."
    },
    {
        icon: MousePointerClick,
        title: "File Tree Shortcuts",
        description: "In the sidebar, click a file to open it in an editor. Alt-click a file or folder to exclude it from the context sent to the model."
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsHelpModalOpen(false)}>
      <div 
        className="bg-[#2c2d2f] w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-gray-700/50 animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Quick Guide</h2>
          <button onClick={() => setIsHelpModalOpen(false)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close help">
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
                    <KeyRound size={20} className="text-yellow-400" />
                    Set Your API Key
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                    You need a Google Gemini API key to use this app. You can get one from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>.
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        value={localKey}
                        onChange={(e) => setLocalKey(e.target.value)}
                        className="flex-grow w-full bg-[#1e1f20] border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="Enter your Gemini API key"
                    />
                    <button
                        onClick={handleSave}
                        disabled={localKey === apiKey}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save
                    </button>
                </div>
            </div>
          
            <div className="space-y-5">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0 bg-gray-700/50 p-2 rounded-lg mt-1">
                     {React.createElement(feature.icon, { size: 20, className: "text-gray-300" })}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-100">{feature.title}</h4>
                    <p className="text-sm text-gray-400">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
                    <BrainCircuit size={20} className="text-purple-400" />
                    Pro Tip: When to use Advanced Coder
                </h3>
                <p className="text-sm text-gray-400 mb-2">
                    Advanced Coder is slower but generates higher-quality code by planning, drafting, and reviewing. It's best for complex, multi-file tasks. Try a prompt like:
                </p>
                <div className="relative bg-[#1e1f20] p-3 rounded-md border border-gray-700">
                    <code className="text-sm text-gray-300">
                        "Create a full-stack React and Node.js application for a simple to-do list with a REST API."
                    </code>
                    <button onClick={() => handleCopyExample("Create a full-stack React and Node.js application for a simple to-do list with a REST API.")} className="absolute top-2 right-2 flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors p-1.5 rounded-md hover:bg-gray-600 disabled:opacity-50">
                        {isCopied ? <Check size={14} className="text-green-400"/> : <Copy size={14} />}
                    </button>
                </div>
                <p className="text-sm text-gray-400 mt-2">
                    For smaller tasks, like writing a single function or fixing a bug, 'Simple Coder' is faster and more efficient.
                </p>
            </div>
        </main>
      </div>
    </div>
  );
};

export default HelpModal;