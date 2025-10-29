import { useState, useCallback } from 'react';

const UNLOCK_CONTEXT_TOKEN_KEY = 'gemini-unlock-context-token';

const getInitialSetting = (): boolean => {
  try {
    const storedValue = localStorage.getItem(UNLOCK_CONTEXT_TOKEN_KEY);
    // Default to 'false' (off) if nothing is stored
    return storedValue === 'true';
  } catch (error)    {
    console.error('Failed to retrieve unlock context token setting from local storage:', error);
    return false; // Default to false on error
  }
};

export const useUnlockContextTokenSetting = (): [boolean, (enabled: boolean) => void] => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(getInitialSetting);

  const saveSetting = useCallback((enabled: boolean) => {
    try {
      setIsUnlocked(enabled);
      localStorage.setItem(UNLOCK_CONTEXT_TOKEN_KEY, String(enabled));
    } catch (error) {
      console.error('Failed to save unlock context token setting to local storage:', error);
    }
  }, []);

  return [isUnlocked, saveSetting];
};
