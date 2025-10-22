import { useState, useCallback } from 'react';
import type { ModeId } from '../types';

const SELECTED_MODE_STORAGE_KEY = 'gemini-selected-mode';

const getInitialMode = (): ModeId => {
  try {
    const storedValue = localStorage.getItem(SELECTED_MODE_STORAGE_KEY);
    // Ensure the stored value is a valid ModeId, otherwise default.
    if (storedValue === 'default' || storedValue === 'simple-coder') {
        return storedValue;
    }
    return 'default';
  } catch (error) {
    console.error('Failed to retrieve selected mode from local storage:', error);
    return 'default';
  }
};

export const useSelectedMode = (): [ModeId, (mode: ModeId) => void] => {
  const [selectedMode, setSelectedMode] = useState<ModeId>(getInitialMode);

  const saveMode = useCallback((mode: ModeId) => {
    try {
      setSelectedMode(mode);
      localStorage.setItem(SELECTED_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Failed to save selected mode to local storage:', error);
    }
  }, []);

  return [selectedMode, saveMode];
};
