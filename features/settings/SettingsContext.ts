import React from 'react';

export interface SettingsContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
  sendWithCtrlEnter: boolean;
  setSendWithCtrlEnter: (enabled: boolean) => void;
  isStreamingEnabled: boolean;
  setStreamingEnabled: (enabled: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (isOpen: boolean) => void;
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: (isOpen: boolean) => void;
}

export const SettingsContext = React.createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = React.useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};