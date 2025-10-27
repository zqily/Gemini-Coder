import { useState, useCallback } from 'react';

const GOOGLE_SEARCH_ENABLED_KEY = 'gemini-google-search-enabled';

const getInitialSetting = (): boolean => {
  try {
    const storedValue = localStorage.getItem(GOOGLE_SEARCH_ENABLED_KEY);
    // Default to 'false' (off) if nothing is stored
    return storedValue === 'true';
  } catch (error) {
    console.error('Failed to retrieve Google Search setting from local storage:', error);
    return false; // Default to false on error
  }
};

export const useGoogleSearchSetting = (): [boolean, (enabled: boolean) => void] => {
  const [isGoogleSearchEnabled, setIsGoogleSearchEnabled] = useState<boolean>(getInitialSetting);

  const saveSetting = useCallback((enabled: boolean) => {
    try {
      setIsGoogleSearchEnabled(enabled);
      localStorage.setItem(GOOGLE_SEARCH_ENABLED_KEY, String(enabled));
    } catch (error) {
      console.error('Failed to save Google Search setting to local storage:', error);
    }
  }, []);

  return [isGoogleSearchEnabled, saveSetting];
};
