import { useState, useCallback } from 'react';

const SEND_SHORTCUT_STORAGE_KEY = 'gemini-send-shortcut-ctrl-enter';

const getInitialSetting = (): boolean => {
  try {
    const storedValue = localStorage.getItem(SEND_SHORTCUT_STORAGE_KEY);
    // Default to 'true' (on) if nothing is stored
    return storedValue === null ? true : storedValue === 'true';
  } catch (error) {
    console.error('Failed to retrieve send shortcut setting from local storage:', error);
    return true; // Default to true on error
  }
};

export const useSendShortcutSetting = (): [boolean, (enabled: boolean) => void] => {
  const [sendWithCtrlEnter, setSendWithCtrlEnter] = useState<boolean>(getInitialSetting);

  const saveSetting = useCallback((enabled: boolean) => {
    try {
      setSendWithCtrlEnter(enabled);
      localStorage.setItem(SEND_SHORTCUT_STORAGE_KEY, String(enabled));
    } catch (error) {
      console.error('Failed to save send shortcut setting to local storage:', error);
    }
  }, []);

  return [sendWithCtrlEnter, saveSetting];
};