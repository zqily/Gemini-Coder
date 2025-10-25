import React, { useState, useCallback, ReactNode } from 'react';
import { SettingsContext, SettingsContextType } from './SettingsContext';
import { useApiKey } from './useApiKey';
import { useSendShortcutSetting } from './useSendShortcutSetting';
import { useStreamingSetting } from './useStreamingSetting';
import SettingsModal from './SettingsModal';
import HelpModal from './HelpModal'; // Import HelpModal

interface SettingsProviderProps {
  children: ReactNode;
}

const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [apiKey, setApiKey] = useApiKey();
  const [sendWithCtrlEnter, setSendWithCtrlEnter] = useSendShortcutSetting();
  const [isStreamingEnabled, setStreamingEnabled] = useStreamingSetting();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false); // New state for HelpModal

  const contextValue: SettingsContextType = {
    apiKey,
    setApiKey,
    sendWithCtrlEnter,
    setSendWithCtrlEnter,
    isStreamingEnabled,
    setStreamingEnabled,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isHelpModalOpen, // Add to context value
    setIsHelpModalOpen, // Add to context value
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
      <SettingsModal />
      <HelpModal /> {/* Render HelpModal here */}
    </SettingsContext.Provider>
  );
};

export default SettingsProvider;