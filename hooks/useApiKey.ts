
import { useState, useEffect, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

export const useApiKey = (): [string, (key: string) => void] => {
  const [apiKey, setApiKey] = useState<string>('');

  useEffect(() => {
    try {
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        setApiKey(storedKey);
      }
    } catch (error) {
      console.error('Failed to retrieve API key from local storage:', error);
    }
  }, []);

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
