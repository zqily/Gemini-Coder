import { useState, useCallback } from 'react';

const STREAMING_ENABLED_STORAGE_KEY = 'gemini-streaming-enabled';

const getInitialSetting = (): boolean => {
  try {
    const storedValue = localStorage.getItem(STREAMING_ENABLED_STORAGE_KEY);
    // Default to 'false' (off) if nothing is stored
    return storedValue === 'true';
  } catch (error) {
    console.error('Failed to retrieve streaming setting from local storage:', error);
    return false; // Default to false on error
  }
};

export const useStreamingSetting = (): [boolean, (enabled: boolean) => void] => {
  const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(getInitialSetting);

  const saveSetting = useCallback((enabled: boolean) => {
    try {
      setIsStreamingEnabled(enabled);
      localStorage.setItem(STREAMING_ENABLED_STORAGE_KEY, String(enabled));
    } catch (error) {
      console.error('Failed to save streaming setting to local storage:', error);
    }
  }, []);

  return [isStreamingEnabled, saveSetting];
};
