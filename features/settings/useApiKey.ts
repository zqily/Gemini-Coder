import { useState, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

const getInitialApiKey = (): string => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch (error) {
    console.error('Failed to retrieve API key from local storage:', error);
    return '';
  }
};

export const useApiKey = (): [string, (key: string) => void] => {
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey);

  const saveApiKey = useCallback((key: string) => {
    try {
      setApiKey(key);
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } catch (error) {
      console.error('Failed to save API key to local storage:', error);
    }
  }, []);

  return [apiKey, saveApiKey];
};
