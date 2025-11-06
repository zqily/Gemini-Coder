import { useState, useCallback } from 'react';
import type { SimpleCoderSettings } from '../../types';

const SIMPLE_CODER_SETTINGS_KEY = 'gemini-simple-coder-settings';

const getInitialSettings = (): SimpleCoderSettings => {
  try {
    const storedValue = localStorage.getItem(SIMPLE_CODER_SETTINGS_KEY);
    if (storedValue) {
        return JSON.parse(storedValue);
    }
  } catch (error) {
    console.error('Failed to retrieve simple coder settings:', error);
  }
  return { persona: 'default', customInstruction: '' };
};

export const useSimpleCoderSettings = (): [SimpleCoderSettings, (settings: SimpleCoderSettings) => void] => {
  const [settings, setSettings] = useState<SimpleCoderSettings>(getInitialSettings);

  const saveSettings = useCallback((newSettings: SimpleCoderSettings) => {
    try {
      setSettings(newSettings);
      localStorage.setItem(SIMPLE_CODER_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save simple coder settings:', error);
    }
  }, []);

  return [settings, saveSettings];
};
