import { useState, useCallback } from 'react';

const SELECTED_MODEL_STORAGE_KEY = 'gemini-selected-model';

const getInitialSetting = (): string => {
  try {
    const storedValue = localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
    // Default to a sensible choice if nothing is stored.
    return storedValue || 'gemini-flash-latest';
  } catch (error) {
    console.error('Failed to retrieve selected model from local storage:', error);
    return 'gemini-flash-latest';
  }
};

export const useSelectedModel = (): [string, (model: string) => void] => {
  const [selectedModel, setSelectedModel] = useState<string>(getInitialSetting);

  const saveSetting = useCallback((model: string) => {
    try {
      setSelectedModel(model);
      localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, model);
    } catch (error) {
      console.error('Failed to save selected model to local storage:', error);
    }
  }, []);

  return [selectedModel, saveSetting];
};